import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProjectContent } from './flows/content.ts';
import { searchSidebarProjects } from './navigation/sidebar-search.ts';

const pdf = { kind: 'material', format: 'pdf', fileName: '검토.PDF', byteLength: 15, data: Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64') };

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

test('빈 프로젝트도 자료·PDF·HTML 검색으로 자료 메뉴를 찾는다', () => {
  const projects = [{ slug: 'empty', title: '신규', categories: [] }];
  for (const query of ['자료', 'PDF', 'html']) {
    assert.equal(searchSidebarProjects(projects, query)[0]?.showMaterials, true);
  }
});
