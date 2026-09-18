export const MAX_MATERIAL_BYTES = 10 * 1024 * 1024;
export const MAX_MATERIAL_PREVIEW_BYTES = 16 * 1024 * 1024;
export const MATERIAL_CATEGORY = 'project-materials';
type MaterialBase = { kind: 'material'; fileName: string; byteLength: number; data: string };
export type MaterialPdfPreview = { format: 'pdf'; fileName: string; byteLength: number; data: string };
export type MaterialContent =
  | (MaterialBase & { format: 'pdf' | 'html'; preview?: never })
  | (MaterialBase & { format: 'pptx'; preview: MaterialPdfPreview });
export type MaterialFileDescriptor = {
  role: 'original' | 'preview'; label: string; fileName: string; mime: string; data: string;
};
export type PptxArchiveEntry = {
  name: string; flags: number; compression: number; crc32: number; compressedSize: number; uncompressedSize: number; localHeaderOffset: number;
};
export type MaterialSummary = {
  slug: string; title: string; description: string | null; format: string;
  fileName: string | null; byteLength: number | null; updatedAt: string;
};
export function materialsHref(project: string, material?: string) {
  return `/flows/${encodeURIComponent(project)}/materials${material ? `/${encodeURIComponent(material)}` : ''}`;
}

const safeFileName = (value: unknown) => typeof value === 'string' && Boolean(value.trim()) && value.length <= 255 && !/[\\/\x00-\x1f\x7f]/.test(value);

function decodeData(value: unknown, byteLength: unknown, maxBytes: number, fail: () => never) {
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 1 || (byteLength as number) > maxBytes ||
      typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail();
  let binary: string;
  try { binary = atob(value as string); } catch { return fail(); }
  if (binary.length !== byteLength || btoa(binary) !== value) fail();
  return binary;
}

function validatePdf(fileName: unknown, byteLength: unknown, data: unknown, maxBytes: number, fail: () => never) {
  if (!safeFileName(fileName) || !/\.pdf$/i.test(fileName as string)) fail();
  const binary = decodeData(data, byteLength, maxBytes, fail);
  if (!/^%PDF-\d\.\d/.test(binary) || !binary.slice(-1024).includes('%%EOF')) fail();
}

export function inspectPptxArchive(input: Uint8Array): PptxArchiveEntry[] {
  if (!input.length || input.length > MAX_MATERIAL_BYTES) throw new Error('PPTX ZIP 크기가 올바르지 않습니다.');
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = Math.max(0, bytes.length - 65557); offset <= bytes.length - 22; offset++) {
    if (view.getUint32(offset, true) === 0x06054b50) end = offset;
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new Error('PPTX ZIP 끝 레코드가 올바르지 않습니다.');
  const entriesOnDisk = view.getUint16(end + 8, true);
  const entryCount = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  const commentLength = view.getUint16(end + 20, true);
  if (!entryCount || entryCount !== entriesOnDisk || entryCount > 4096 || end + 22 + commentLength !== bytes.length ||
      centralOffset + centralSize > end) throw new Error('PPTX ZIP 디렉터리가 올바르지 않습니다.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: PptxArchiveEntry[] = [];
  const localRanges: Array<{ start: number; end: number }> = [];
  const names = new Set<string>();
  let cursor = centralOffset, expandedBytes = 0;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('PPTX ZIP 엔트리가 올바르지 않습니다.');
    const flags = view.getUint16(cursor + 8, true);
    const compression = view.getUint16(cursor + 10, true);
    const crc32 = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const entryCommentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (!nameLength || next > end || flags & 1 || ![0, 8].includes(compression) || localHeaderOffset >= centralOffset) throw new Error('PPTX ZIP 엔트리 제한을 위반했습니다.');
    let name: string;
    try { name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); }
    catch { throw new Error('PPTX ZIP 파일명이 올바르지 않습니다.'); }
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || name.includes('\0') || names.has(name)) throw new Error('PPTX ZIP 경로가 올바르지 않습니다.');
    names.add(name);
    if (localHeaderOffset + 30 > centralOffset || view.getUint32(localHeaderOffset, true) !== 0x04034b50) throw new Error('PPTX ZIP 로컬 엔트리가 올바르지 않습니다.');
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localCompression = view.getUint16(localHeaderOffset + 8, true);
    const localCrc32 = view.getUint32(localHeaderOffset + 14, true);
    const localCompressedSize = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedSize = view.getUint32(localHeaderOffset + 22, true);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    let localName: string;
    try { localName = decoder.decode(bytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength)); }
    catch { throw new Error('PPTX ZIP 로컬 파일명이 올바르지 않습니다.'); }
    if (localName !== name || localFlags !== flags || localCompression !== compression || dataOffset + compressedSize > centralOffset ||
        (!(flags & 8) && (localCrc32 !== crc32 || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize))) throw new Error('PPTX 압축 크기 정보가 일치하지 않습니다.');
    let localEnd = dataOffset + compressedSize;
    if (flags & 8) {
      let descriptor = localEnd;
      if (descriptor + 4 <= centralOffset && view.getUint32(descriptor, true) === 0x08074b50) descriptor += 4;
      if (descriptor + 12 > centralOffset || view.getUint32(descriptor, true) !== crc32 ||
          view.getUint32(descriptor + 4, true) !== compressedSize || view.getUint32(descriptor + 8, true) !== uncompressedSize) {
        throw new Error('PPTX ZIP data descriptor가 올바르지 않습니다.');
      }
      localEnd = descriptor + 12;
    }
    localRanges.push({ start: localHeaderOffset, end: localEnd });
    expandedBytes += uncompressedSize;
    if (uncompressedSize > 32 * 1024 * 1024 || expandedBytes > 128 * 1024 * 1024) throw new Error('PPTX 압축 해제 크기가 제한을 초과합니다.');
    entries.push({ name, flags, compression, crc32, compressedSize, uncompressedSize, localHeaderOffset });
    cursor = next;
  }
  localRanges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < localRanges.length; index++) {
    if (localRanges[index].start < localRanges[index - 1].end) throw new Error('PPTX ZIP 로컬 엔트리가 서로 겹칩니다.');
  }
  if (cursor !== centralOffset + centralSize || !entries.some(entry => entry.name === '[Content_Types].xml') ||
      !entries.some(entry => entry.name === 'ppt/presentation.xml')) throw new Error('PPTX 필수 문서가 없습니다.');
  return entries;
}

export function validatePptxSource(value: { fileName: unknown; byteLength: unknown; data: unknown }) {
  const fail = (): never => { throw new Error('올바른 PPTX 파일(최대 10MB)이 필요합니다.'); };
  if (!safeFileName(value.fileName) || !/\.pptx$/i.test(value.fileName as string)) fail();
  const binary = decodeData(value.data, value.byteLength, MAX_MATERIAL_BYTES, fail);
  try { inspectPptxArchive(Uint8Array.from(binary, character => character.charCodeAt(0))); }
  catch { fail(); }
}

export function materialFileDescriptors(content: MaterialContent): MaterialFileDescriptor[] {
  const original = {
    role: 'original' as const,
    label: content.format === 'pptx' ? '원본 PPTX 다운로드' : '원본 다운로드',
    fileName: content.fileName,
    mime: content.format === 'pdf' ? 'application/pdf' : content.format === 'html' ? 'text/html;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    data: content.data,
  };
  return content.format === 'pptx'
    ? [original, { role: 'preview', label: 'PDF 다운로드', fileName: content.preview.fileName, mime: 'application/pdf', data: content.preview.data }]
    : [original];
}

export function hasMaterialStorageReference(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const content = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(content, 'storage')) return true;
  const preview = content.preview;
  return Boolean(preview && typeof preview === 'object' && !Array.isArray(preview) && Object.prototype.hasOwnProperty.call(preview, 'storage'));
}

/** 브라우저와 서버 양쪽에서 같은 파일 경계를 검증한다. */
export function validateMaterial(value: Record<string, unknown>): asserts value is MaterialContent {
  const fail = (): never => { throw new Error('올바른 PDF, UTF-8 HTML 또는 PPTX 파일(최대 10MB)이 필요합니다.'); };
  if (value.kind !== 'material' || !['pdf', 'html', 'pptx'].includes(value.format as string) || !safeFileName(value.fileName)) fail();
  if (value.format === 'pdf') {
    validatePdf(value.fileName, value.byteLength, value.data, MAX_MATERIAL_BYTES, fail);
    if (value.preview !== undefined) fail();
  } else if (value.format === 'html') {
    if (!/\.html?$/i.test(value.fileName as string)) fail();
    const binary = decodeData(value.data, value.byteLength, MAX_MATERIAL_BYTES, fail);
    let html: string;
    try { html = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))); }
    catch { return fail(); }
    if (html.includes('\0') || !/<(?:!doctype\s+html|html|head|body|main|section|article|div|h[1-6]|p|table|style)\b/i.test(html)) fail();
    if (value.preview !== undefined) fail();
  } else {
    validatePptxSource({ fileName: value.fileName, byteLength: value.byteLength, data: value.data });
    if (!value.preview || typeof value.preview !== 'object' || Array.isArray(value.preview)) fail();
    const preview = value.preview as Record<string, unknown>;
    if (preview.format !== 'pdf') fail();
    validatePdf(preview.fileName, preview.byteLength, preview.data, MAX_MATERIAL_PREVIEW_BYTES, fail);
  }
}
