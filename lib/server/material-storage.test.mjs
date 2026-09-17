import test from 'node:test';
import assert from 'node:assert/strict';
import { compactMaterial, encodeMaterial, restoreMaterial, storeMaterial } from './material-storage.mjs';
import { sha256, validateReference, storageConfig, verifiedObjectBytes } from './object-storage.mjs';
import { Readable } from 'node:stream';

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
