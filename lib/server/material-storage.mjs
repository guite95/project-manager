import { storageConfig, putObjectWithStatus, readObject, deleteObject, ObjectCleanupRequiredError } from './object-storage.mjs';

const defaultObjectStore = { storageConfig, putObject: putObjectWithStatus, deleteObject };

export function encodeMaterial(content) {
  if (content.kind === 'material') return { bytes: Buffer.from(content.data, 'base64'), mime: content.format === 'pdf' ? 'application/pdf' : content.format === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'text/html; charset=utf-8' };
  if (content.kind === 'html') return { bytes: Buffer.from(content.html), mime: 'text/html; charset=utf-8' };
  if (content.kind === 'slides') return { bytes: Buffer.from(JSON.stringify({ styles: content.styles, slides: content.slides })), mime: 'application/json' };
  throw new Error('이전 가능한 자료 형식이 아닙니다.');
}
export function encodeMaterialPreview(content) {
  if (content.kind !== 'material' || content.format !== 'pptx' || content.preview?.format !== 'pdf') throw new Error('PPTX PDF 미리보기가 없습니다.');
  return { bytes: Buffer.from(content.preview.data, 'base64'), mime: 'application/pdf' };
}
export function compactMaterial(content, storage, previewStorage) {
  const { data, html, styles, slides, ...metadata } = content;
  if (content.kind === 'material' && content.format === 'pptx') {
    if (!previewStorage) throw new Error('PPTX PDF 미리보기 저장소 참조가 없습니다.');
    const { data: previewData, ...preview } = content.preview;
    return { ...metadata, storage, preview: { ...preview, storage: previewStorage } };
  }
  return { ...metadata, storage };
}
export function materialWithoutStorage(content) {
  const { storage, ...metadata } = content;
  if (!metadata.preview || typeof metadata.preview !== 'object' || Array.isArray(metadata.preview)) return metadata;
  const { storage: previewStorage, ...preview } = metadata.preview;
  return { ...metadata, preview };
}
/**
 * @param {unknown} content
 * @param {string} project
 * @param {string} slug
 * @param {{ objectStore?: typeof defaultObjectStore, onCleanupFailure?: (storage: Record<string, unknown>) => Promise<void> }} [options]
 */
export async function storeMaterial(content, project, slug, { objectStore = defaultObjectStore, onCleanupFailure } = {}) {
  if (!objectStore.storageConfig()) return content;
  if (content.storage) throw new Error('업로드에 저장소 참조를 지정할 수 없습니다.');
  const { bytes, mime } = encodeMaterial(content);
  let originalUpload;
  try { originalUpload = await objectStore.putObject(bytes, project, slug, mime); }
  catch (error) {
    if (error instanceof ObjectCleanupRequiredError && onCleanupFailure) await onCleanupFailure(error.storage);
    throw error;
  }
  const storage = originalUpload.ref;
  if (content.kind === 'material' && content.format === 'pptx') {
    const preview = encodeMaterialPreview(content);
    try {
      const previewUpload = await objectStore.putObject(preview.bytes, project, slug, preview.mime);
      return compactMaterial(content, storage, previewUpload.ref);
    } catch (error) {
      if (error instanceof ObjectCleanupRequiredError && onCleanupFailure) await onCleanupFailure(error.storage);
      if (originalUpload.created) {
        try { await objectStore.deleteObject(storage, project, slug); }
        catch {
          if (onCleanupFailure) await onCleanupFailure(storage);
          else throw new ObjectCleanupRequiredError(storage);
        }
      }
      throw error;
    }
  }
  return compactMaterial(content, storage);
}
export async function restoreMaterial(document, project, slug) {
  const content = document?.content;
  if (!content?.storage) return document;
  const bytes = await readObject(content.storage, project, slug);
  const { storage, ...metadata } = content;
  let restored;
  if (content.kind === 'material') {
    if (bytes.length !== content.byteLength) throw new Error('자료 메타데이터 크기가 일치하지 않습니다.');
    restored = { ...metadata, data: bytes.toString('base64') };
    if (content.format === 'pptx') {
      if (!content.preview?.storage) throw new Error('PPTX PDF 미리보기 저장소 참조가 없습니다.');
      const previewBytes = await readObject(content.preview.storage, project, slug);
      if (previewBytes.length !== content.preview.byteLength) throw new Error('PPTX PDF 미리보기 크기가 일치하지 않습니다.');
      const { storage: previewStorage, ...preview } = content.preview;
      restored.preview = { ...preview, data: previewBytes.toString('base64') };
    }
  } else if (content.kind === 'html') restored = { ...metadata, html: bytes.toString('utf8') };
  else if (content.kind === 'slides') restored = { ...metadata, ...JSON.parse(bytes.toString('utf8')), kind: 'slides' };
  else throw new Error('저장된 자료 형식이 올바르지 않습니다.');
  return { ...document, content: restored };
}
