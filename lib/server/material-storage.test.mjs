import test from 'node:test';
import assert from 'node:assert/strict';
import { compactMaterial, encodeMaterial, encodeMaterialPreview, materialWithoutStorage, restoreMaterial, storeMaterial } from './material-storage.mjs';
import { sha256, validateReference, storageConfig, verifiedObjectBytes } from './object-storage.mjs';
import { Readable } from 'node:stream';
import { makePptx } from '../test-helpers/pptx.mjs';

test('객체 다운로드의 해시·잘린 본문·초과 본문을 검증한다', async () => {
  const bytes = Buffer.from('verified');
  const ref = { bytes: bytes.length, sha256: sha256(bytes) };
  const response = body => ({ contentLength: ref.bytes, value: Readable.from([body]) });
  assert.deepEqual(await verifiedObjectBytes(response(bytes), ref), bytes);
  await assert.rejects(() => verifiedObjectBytes(response(Buffer.from('tampered')), ref));
  await assert.rejects(() => verifiedObjectBytes(response(bytes.subarray(1)), ref));
  await assert.rejects(() => verifiedObjectBytes(response(Buffer.concat([bytes, bytes])), ref));
  await assert.rejects(() => verifiedObjectBytes({ ...response(bytes), contentLength: 999 }, ref));
});

test('자료 원본 변환은 PDF·UTF-8 HTML·슬라이드를 손실 없이 보존한다', () => {
  const body = Buffer.from('%PDF-1.7\n%%EOF\n');
  const c = { kind: 'material', format: 'pdf', fileName: '자료.pdf', byteLength: body.length, data: body.toString('base64') };
  assert.deepEqual(encodeMaterial(c).bytes, body);
  assert.equal(encodeMaterial({ kind: 'html', html: '<h1>자료</h1>' }).bytes.toString(), '<h1>자료</h1>');
  const slides = { kind: 'slides', styles: '.slide {}', slides: [{ title: '자료', html: '<p>안녕</p>' }] };
  assert.deepEqual(JSON.parse(encodeMaterial(slides).bytes.toString()), { styles: slides.styles, slides: slides.slides });
  assert.deepEqual(compactMaterial(c, { key: 'ref' }), { kind: 'material', format: 'pdf', fileName: '자료.pdf', byteLength: body.length, storage: { key: 'ref' } });
});

test('PPTX 원본과 PDF 미리보기는 별도 객체로 보존하고 본문만 압축한다', () => {
  const original = makePptx();
  const preview = Buffer.from('%PDF-1.7\n%%EOF\n');
  const content = {
    kind: 'material', format: 'pptx', fileName: '발표자료.pptx', byteLength: original.length, data: original.toString('base64'),
    preview: { format: 'pdf', fileName: '발표자료.pdf', byteLength: preview.length, data: preview.toString('base64') },
  };
  assert.deepEqual(encodeMaterial(content), {
    bytes: original,
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  assert.deepEqual(encodeMaterialPreview(content), { bytes: preview, mime: 'application/pdf' });
  assert.deepEqual(compactMaterial(content, { key: 'original' }, { key: 'preview' }), {
    kind: 'material', format: 'pptx', fileName: '발표자료.pptx', byteLength: original.length, storage: { key: 'original' },
    preview: { format: 'pdf', fileName: '발표자료.pdf', byteLength: preview.length, storage: { key: 'preview' } },
  });
  assert.deepEqual(materialWithoutStorage({
    ...content, storage: { key: 'original' }, preview: { ...content.preview, storage: { key: 'preview' } },
  }), content);
});

test('PPTX 미리보기 업로드 실패 시 먼저 업로드한 원본 객체를 보상 삭제한다', async () => {
  const original = makePptx();
  const preview = Buffer.from('%PDF-1.7\n%%EOF\n');
  const content = {
    kind: 'material', format: 'pptx', fileName: '발표자료.pptx', byteLength: original.length, data: original.toString('base64'),
    preview: { format: 'pdf', fileName: '발표자료.pdf', byteLength: preview.length, data: preview.toString('base64') },
  };
  const originalRef = { key: 'original' };
  const deleted = [];
  let upload = 0;
  const objectStore = {
    storageConfig: () => ({ configured: true }),
    putObject: async () => {
      upload++;
      if (upload === 1) return { ref: originalRef, created: true };
      throw new Error('preview upload failed');
    },
    deleteObject: async ref => { deleted.push(ref); },
  };
  await assert.rejects(() => storeMaterial(content, 'p', 's', { objectStore }), /preview upload failed/);
  assert.deepEqual(deleted, [originalRef]);

  upload = 0;
  deleted.length = 0;
  objectStore.putObject = async () => {
    upload++;
    if (upload === 1) return { ref: originalRef, created: false };
    throw new Error('preview upload failed');
  };
  await assert.rejects(() => storeMaterial(content, 'p', 's', { objectStore }), /preview upload failed/);
  assert.deepEqual(deleted, []);

  upload = 0;
  const cleanup = [];
  objectStore.putObject = async () => {
    upload++;
    if (upload === 1) return { ref: originalRef, created: true };
    throw new Error('preview upload failed');
  };
  objectStore.deleteObject = async () => { throw new Error('delete failed'); };
  await assert.rejects(() => storeMaterial(content, 'p', 's', { objectStore, onCleanupFailure: async ref => cleanup.push(ref) }), /preview upload failed/);
  assert.deepEqual(cleanup, [originalRef]);
});

test('OCI 참조는 지정 버킷·프로젝트·자료·해시·크기로 제한한다', () => {
  process.env.OCI_STORAGE_REGION = 'ap-chuncheon-1';
  process.env.OCI_STORAGE_NAMESPACE = 'test';
  process.env.OCI_STORAGE_BUCKET = 'materials';
  const hash = sha256(Buffer.from('test'));
  const ref = { provider: 'oci', version: 1, ...storageConfig(), key: `materials/project/file/${hash}`, sha256: hash, bytes: 4 };
  assert.equal(validateReference(ref, 'project', 'file'), ref);
  for (const change of [{ bucket: 'other' }, { region: 'us-ashburn-1' }, { namespace: 'other' }, { bytes: -1 }, { bytes: 20 * 1024 * 1024 }, { key: '../file' }, { sha256: 'bad' }]) {
    assert.throws(() => validateReference({ ...ref, ...change }, 'project', 'file'));
  }
  assert.throws(() => validateReference(ref, 'other', 'file'));
  assert.throws(() => validateReference(ref, 'project', 'other'));
});

test('미설정 환경은 기존 DB 자료를 유지하고 부분 설정은 실패한다', async () => {
  for (const key of ['OCI_STORAGE_REGION', 'OCI_STORAGE_NAMESPACE', 'OCI_STORAGE_BUCKET']) delete process.env[key];
  const document = { content: { kind: 'html', html: '<h1>기존</h1>' } };
  assert.equal(await restoreMaterial(document, 'p', 's'), document);
  assert.equal(await storeMaterial(document.content, 'p', 's'), document.content);
  process.env.OCI_STORAGE_REGION = 'ap-chuncheon-1';
  assert.throws(() => storageConfig());
  delete process.env.OCI_STORAGE_REGION;
});
