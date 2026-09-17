import { storageConfig, putObject, readObject } from './object-storage.mjs';

export function encodeMaterial(content) {
  if (content.kind === 'material') return { bytes: Buffer.from(content.data, 'base64'), mime: content.format === 'pdf' ? 'application/pdf' : 'text/html; charset=utf-8' };
  if (content.kind === 'html') return { bytes: Buffer.from(content.html), mime: 'text/html; charset=utf-8' };
  if (content.kind === 'slides') return { bytes: Buffer.from(JSON.stringify({ styles: content.styles, slides: content.slides })), mime: 'application/json' };
  throw new Error('이전 가능한 자료 형식이 아닙니다.');
}
export function compactMaterial(content, storage) {
  const { data, html, styles, slides, ...metadata } = content;
  return { ...metadata, storage };
}
export async function storeMaterial(content, project, slug) {
  if (!storageConfig()) return content;
  if (content.storage) throw new Error('업로드에 저장소 참조를 지정할 수 없습니다.');
  const { bytes, mime } = encodeMaterial(content);
  return compactMaterial(content, await putObject(bytes, project, slug, mime));
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
  } else if (content.kind === 'html') restored = { ...metadata, html: bytes.toString('utf8') };
  else if (content.kind === 'slides') restored = { ...metadata, ...JSON.parse(bytes.toString('utf8')), kind: 'slides' };
  else throw new Error('저장된 자료 형식이 올바르지 않습니다.');
  return { ...document, content: restored };
}
