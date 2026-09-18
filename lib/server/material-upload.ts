import { MAX_MATERIAL_BYTES, validateMaterial, validatePptxSource, type MaterialContent } from '../materials.ts';
import { convertPresentationToPdf } from './presentation-converter.mjs';

export class MaterialUploadError extends Error {
  readonly status: 400 | 413 | 415 | 422;
  constructor(message: string, status: 400 | 413 | 415 | 422) { super(message); this.status = status; }
}

export async function prepareMaterialContent(
  fileName: string,
  input: Uint8Array,
  converterOptions?: { executable?: string; timeoutMs?: number },
): Promise<MaterialContent> {
  const bytes = Buffer.from(input);
  if (!bytes.length) throw new MaterialUploadError('비어 있지 않은 파일을 선택해 주세요.', 400);
  if (bytes.length > MAX_MATERIAL_BYTES) throw new MaterialUploadError('파일은 최대 10MB까지 추가할 수 있습니다.', 413);
  const format = /\.pdf$/i.test(fileName) ? 'pdf' : /\.html?$/i.test(fileName) ? 'html' : /\.pptx$/i.test(fileName) ? 'pptx' : null;
  if (!format) throw new MaterialUploadError('PDF, HTML 또는 PPTX 파일만 추가할 수 있습니다.', 415);
  const data = bytes.toString('base64');
  let content: MaterialContent;
  if (format === 'pptx') {
    try { validatePptxSource({ fileName, byteLength: bytes.length, data }); }
    catch (error) { throw new MaterialUploadError((error as Error).message, 400); }
    let pdf: Buffer;
    try { pdf = await convertPresentationToPdf(bytes, converterOptions); }
    catch { throw new MaterialUploadError('PPTX를 PDF로 변환하지 못했습니다. 파일 손상 여부와 지원되지 않는 요소를 확인해 주세요.', 422); }
    content = { kind: 'material', format, fileName, byteLength: bytes.length, data,
      preview: { format: 'pdf', fileName: fileName.replace(/\.pptx$/i, '.pdf'), byteLength: pdf.length, data: pdf.toString('base64') } };
  } else content = { kind: 'material', format, fileName, byteLength: bytes.length, data };
  try { validateMaterial(content); }
  catch (error) { throw new MaterialUploadError((error as Error).message, 400); }
  return content;
}
