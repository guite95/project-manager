import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProjectContent } from './flows/content.ts';
import { hasMaterialStorageReference, inspectPptxArchive, materialFileDescriptors } from './materials.ts';
import { searchSidebarProjects } from './navigation/sidebar-search.ts';
import { makePptx } from './test-helpers/pptx.mjs';

const pdf = { kind: 'material', format: 'pdf', fileName: '검토.PDF', byteLength: 15, data: Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64') };
const pptxBytes = makePptx();
const pptx = {
  kind: 'material', format: 'pptx', fileName: '발표자료.pptx', byteLength: pptxBytes.length, data: pptxBytes.toString('base64'),
  preview: { format: 'pdf', fileName: '발표자료.pdf', byteLength: 15, data: Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64') },
};

test('PDF 자료를 문서 콘텐츠로 검증하고 잘못된 파일과 크기를 거부한다', () => {
  assert.doesNotThrow(() => validateProjectContent(pdf));
  for (const content of [
    { ...pdf, data: Buffer.from('<html>bad</html>').toString('base64') },
    { ...pdf, byteLength: 1 }, { ...pdf, data: '!!!!' },
    { ...pdf, byteLength: 11 * 1024 * 1024 }, { ...pdf, fileName: '../bad.pdf' },
  ]) assert.throws(() => validateProjectContent(content));
});

test('HTML 자료를 검증하고 잘못된 형식은 거부한다', () => {
  const html = Buffer.from('<!doctype html><h1>한글 자료</h1>');
  assert.doesNotThrow(() => validateProjectContent({ kind: 'material', format: 'html', fileName: '자료.html', byteLength: html.length, data: html.toString('base64') }));
  assert.throws(() => validateProjectContent({ ...pdf, format: 'exe' }));
});

test('PPTX 자료는 유효한 프레젠테이션 원본과 PDF 미리보기를 함께 요구한다', () => {
  assert.doesNotThrow(() => validateProjectContent(pptx));
  assert.throws(() => validateProjectContent({ ...pptx, preview: undefined }));
  assert.throws(() => validateProjectContent({ ...pptx, data: Buffer.from('not-a-pptx').toString('base64'), byteLength: 10 }));
  assert.throws(() => validateProjectContent({ ...pptx, preview: { ...pptx.preview, data: Buffer.from('<html>bad</html>').toString('base64') } }));
});

test('PPTX ZIP 로컬 엔트리가 서로 겹치면 거부한다', () => {
  const overlapped = makePptx();
  const firstCentral = overlapped.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const originalCompressedSize = overlapped.readUInt32LE(firstCentral + 20);
  overlapped.writeUInt32LE(originalCompressedSize + 8, firstCentral + 20);
  overlapped.writeUInt32LE(originalCompressedSize + 8, 18);
  assert.throws(() => inspectPptxArchive(overlapped), /겹/);
});

test('data descriptor 플래그만 있고 실제 descriptor가 없는 PPTX ZIP은 거부한다', () => {
  const missingDescriptor = makePptx();
  const firstCentral = missingDescriptor.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  missingDescriptor.writeUInt16LE(missingDescriptor.readUInt16LE(6) | 8, 6);
  missingDescriptor.writeUInt32LE(0, 14);
  missingDescriptor.writeUInt32LE(0, 18);
  missingDescriptor.writeUInt32LE(0, 22);
  missingDescriptor.writeUInt16LE(missingDescriptor.readUInt16LE(firstCentral + 8) | 8, firstCentral + 8);
  assert.throws(() => inspectPptxArchive(missingDescriptor), /descriptor/);
});

test('PPTX 자료는 원본 PPTX와 변환된 PDF를 모두 다운로드 대상으로 제공한다', () => {
  assert.deepEqual(materialFileDescriptors(pptx).map(({ label, fileName, mime }) => ({ label, fileName, mime })), [
    { label: '원본 PPTX 다운로드', fileName: '발표자료.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    { label: 'PDF 다운로드', fileName: '발표자료.pdf', mime: 'application/pdf' },
  ]);
});

test('원본 또는 PDF 미리보기의 서버 저장소 참조를 모두 식별한다', () => {
  assert.equal(hasMaterialStorageReference({ ...pptx, storage: { key: 'original' } }), true);
  assert.equal(hasMaterialStorageReference({ ...pptx, preview: { ...pptx.preview, storage: { key: 'preview' } } }), true);
  assert.equal(hasMaterialStorageReference(pptx), false);
});

test('빈 프로젝트도 자료·PDF·HTML·PPTX 검색으로 자료 메뉴를 찾는다', () => {
  const projects = [{ slug: 'empty', title: '신규', categories: [] }];
  for (const query of ['자료', 'PDF', 'html', 'pptx']) {
    assert.equal(searchSidebarProjects(projects, query)[0]?.showMaterials, true);
  }
});
