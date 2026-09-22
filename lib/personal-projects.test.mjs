import test from 'node:test';
import assert from 'node:assert/strict';
import { isPersonalProject, personalProjectGroup } from './personal-projects.ts';
import { hasProjectNotes } from './project-notes.ts';
import { searchSidebarProjects } from './navigation/sidebar-search.ts';
import { mergeSidebarGroupOrder } from './navigation/sidebar-order.ts';
import { parseUiPreferenceChanges } from './ui-preferences.ts';

test('개인 프로젝트와 분류는 이름이나 고정 목록이 아닌 DB 메타데이터로 판정한다', () => {
  const project={slug:'any-new-id',title:'새 프로젝트',scope:'PERSONAL',categories:[]};
  assert.equal(isPersonalProject(project),true);
  assert.equal(isPersonalProject({slug:'personal-old',scope:'COMPANY'}),false);
  assert.equal(isPersonalProject(undefined),false);
  assert.equal(hasProjectNotes(project),true);
  assert.equal(searchSidebarProjects([project],'기록')[0].showNotes,true);
  assert.equal(personalProjectGroup(project.slug,{[project.slug]:'toy'}),'toy');
  assert.equal(personalProjectGroup(project.slug,{}),undefined);
});
test('분류 입력의 형식을 검증하고 프로젝트 존재 여부는 DB 저장 경로에서 검사한다', () => {
  assert.deepEqual(parseUiPreferenceChanges('personal-project-groups',{'new-id':'toy'}),{'new-id':'toy'});
  for(const invalid of [{'new-id':'other'},{'new-id':true},{'bad/id':'toy'}]) assert.throws(()=>parseUiPreferenceChanges('personal-project-groups',invalid));
});
test('reordering one sidebar group preserves the other group order', () => {
  assert.deepEqual(mergeSidebarGroupOrder(['tns','personal-a','focus','personal-b'], ['personal-b','personal-a']), ['tns','personal-b','focus','personal-a']);
});
