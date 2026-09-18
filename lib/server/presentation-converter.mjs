import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { SaxesParser } from 'saxes';
import { inspectPptxArchive } from '../materials.ts';

const execute = promisify(execFile);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 16 * 1024 * 1024;
const MAX_PENDING_CONVERSIONS = 3;
let conversionTail = Promise.resolve();
let pendingConversions = 0;

function readArchiveEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new Error('PPTX ZIP 로컬 엔트리가 올바르지 않습니다.');
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new Error('PPTX ZIP 엔트리 크기가 올바르지 않습니다.');
  const compressed = bytes.subarray(start, end);
  const result = entry.compression === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize + 1 });
  if (result.length !== entry.uncompressedSize) throw new Error('PPTX ZIP 압축 해제 크기가 일치하지 않습니다.');
  return result;
}

function xmlStartTags(xml, localNames) {
  const wanted = new Set(localNames.map(name => name.toLowerCase()));
  const tags = [];
  let failure;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => { failure ??= new Error('PPTX XML DTD는 허용되지 않습니다.'); });
  parser.on('error', error => { failure ??= error; });
  parser.on('opentag', tag => {
    if (!wanted.has(tag.local.toLowerCase())) return;
    const attributes = new Map();
    for (const attribute of Object.values(tag.attributes)) {
      const key = attribute.local.toLowerCase();
      if (attributes.has(key)) failure ??= new Error('PPTX XML 속성이 중복되었습니다.');
      attributes.set(key, attribute.value);
    }
    tags.push(attributes);
  });
  try { parser.write(xml).close(); }
  catch (error) { failure ??= error; }
  if (failure) throw new Error('PPTX XML 문서가 올바르지 않거나 허용되지 않은 선언을 포함합니다.');
  return tags;
}

function validateSafePresentation(bytes) {
  const entries = inspectPptxArchive(bytes);
  if (entries.some(entry => /(?:^|\/)vbaProject\.bin$/i.test(entry.name))) throw new Error('매크로가 포함된 PPTX는 허용하지 않습니다.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const entry of entries) {
    let body;
    try { body = readArchiveEntry(bytes, entry); }
    catch { throw new Error('PPTX 압축 해제 결과가 크기 정보와 일치하지 않습니다.'); }
    if (!entry.name.endsWith('.rels') && entry.name !== '[Content_Types].xml') continue;
    if (entry.uncompressedSize > 1024 * 1024) throw new Error('PPTX XML 관계 파일이 너무 큽니다.');
    let xml;
    try { xml = decoder.decode(body); }
    catch { throw new Error('PPTX XML 관계 파일을 읽을 수 없습니다.'); }
    if (entry.name.endsWith('.rels')) {
      for (const attributes of xmlStartTags(xml, ['Relationship'])) {
        const targetMode = attributes.get('targetmode')?.trim().toLowerCase();
        const target = attributes.get('target')?.trim() ?? '';
        const type = attributes.get('type')?.trim().toLowerCase() ?? '';
        if (targetMode === 'external' || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('\\\\')) {
          throw new Error('외부 연결이 포함된 PPTX는 허용하지 않습니다.');
        }
        if (type.includes('vbaproject') || type.includes('macro')) throw new Error('매크로가 포함된 PPTX는 허용하지 않습니다.');
      }
    } else {
      for (const attributes of xmlStartTags(xml, ['Override', 'Default'])) {
        const contentType = attributes.get('contenttype')?.toLowerCase() ?? '';
        if (contentType.includes('vbaproject') || contentType.includes('macroenabled')) throw new Error('매크로가 포함된 PPTX는 허용하지 않습니다.');
      }
    }
  }
}

function validPdf(bytes) {
  return bytes.length > 0 && bytes.length <= MAX_PDF_BYTES && bytes.subarray(0, 8).toString('binary').match(/^%PDF-\d\.\d/) &&
    bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from('%%EOF'));
}

function converterEnvironment() {
  const environment = { SAL_DISABLE_OPENCL: '1' };
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ']) {
    if (typeof process.env[key] === 'string') environment[key] = process.env[key];
  }
  return environment;
}

async function withConversionSlot(task) {
  if (pendingConversions >= MAX_PENDING_CONVERSIONS) throw new Error('PPTX 변환 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  pendingConversions++;
  const previous = conversionTail;
  let release;
  conversionTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await task(); }
  finally {
    pendingConversions--;
    release();
  }
}

export async function convertPresentationToPdf(input, { executable = process.env.LIBREOFFICE_BIN || 'soffice', timeoutMs = 60_000 } = {}) {
  const bytes = Buffer.from(input);
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('올바른 PPTX 파일이 아닙니다.');
  validateSafePresentation(bytes);
  return withConversionSlot(async () => {
    const root = await mkdtemp(join(tmpdir(), 'pm-pptx-'));
    const outputDir = join(root, 'output');
    const inputPath = join(root, 'source.pptx');
    try {
      await mkdir(outputDir, { mode: 0o700 });
      await writeFile(inputPath, bytes, { mode: 0o600 });
      const profileUrl = pathToFileURL(join(root, 'profile')).href;
      await execute(executable, [
        '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
        `-env:UserInstallation=${profileUrl}`,
        '--convert-to', 'pdf:impress_pdf_Export', '--outdir', outputDir, inputPath,
      ], { timeout: timeoutMs, maxBuffer: 1024 * 1024, env: converterEnvironment() });
      const outputPath = join(outputDir, 'source.pdf');
      const output = await stat(outputPath);
      if (!output.isFile() || output.size < 1 || output.size > MAX_PDF_BYTES) throw new Error('변환 결과 PDF 크기가 올바르지 않습니다.');
      const pdf = await readFile(outputPath);
      if (!validPdf(pdf)) throw new Error('변환 결과가 올바른 PDF가 아닙니다.');
      return pdf;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('변환 결과')) throw error;
      throw new Error('PPTX를 PDF로 변환하지 못했습니다.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
