import test from 'node:test';
import assert from 'node:assert/strict';
import * as personal from './personal-projects.ts';
import { hasProjectNotes } from './project-notes.ts';
import { searchSidebarProjects } from './navigation/sidebar-search.ts';
import * as order from './navigation/sidebar-order.ts';
import { parseUiPreferenceChanges } from './ui-preferences.ts';

test('개인 프로젝트 기본 분류와 저장한 분류를 적용한다', () => {
  assert.equal(personal.personalProjectGroup('personal-flight-app'), 'portfolio');
  assert.equal(personal.personalProjectGroup('personal-ilchul'), 'portfolio');
  assert.equal(personal.personalProjectGroup('personal-project-management'), 'toy');
  const saved = { 'personal-flight-app': 'toy', 'personal-project-management': 'portfolio' };
  assert.equal(personal.personalProjectGroup('personal-flight-app', saved), 'toy');
  assert.equal(personal.personalProjectGroup('personal-project-management', saved), 'portfolio');
  assert.equal(personal.personalProjectGroup('personal-ilchul', saved), 'portfolio');
  assert.equal(personal.personalProjectGroup('personal-flight-app', { 'personal-flight-app': 'invalid' }), 'portfolio');
  assert.equal(personal.personalProjectGroup('tns', { tns: 'toy' }), undefined);
});

test('분류 저장은 등록된 개인 프로젝트와 두 분류만 허용한다', () => {
  const changes = { 'personal-flight-app': 'toy', 'personal-project-management': 'portfolio' };
  assert.deepEqual(parseUiPreferenceChanges('personal-project-groups', changes), changes);
  for (const invalid of [{ tns: 'toy' }, { 'personal-unknown': 'toy' }, { 'personal-flight-app': 'other' }, { 'personal-flight-app': true }]) {
    assert.throws(() => parseUiPreferenceChanges('personal-project-groups', invalid));
  }
  assert.throws(() => parseUiPreferenceChanges('navigation', { panelCollapsed: 'toy' }));
});

test('personal projects have isolated identities and editable record menus', () => {
  assert.equal(personal.personalProjects.length, 3);
  for (const project of personal.personalProjects) {
    assert.ok(project.slug.startsWith('personal-'));
    assert.equal(personal.isPersonalProject(project.slug), true);
    assert.equal(hasProjectNotes(project.slug), true);
    const [entry] = searchSidebarProjects([{ ...project, categories: [] }], '기록');
    assert.equal(entry.showNotes, true);
  }
  assert.equal(personal.isPersonalProject('tns'), false);
  assert.equal(personal.isPersonalProject('personal-unknown'), false);
});

test('reordering one sidebar group preserves the other group order', () => {
  assert.deepEqual(order.mergeSidebarGroupOrder(['tns','personal-a','focus','personal-b'], ['personal-b','personal-a']), ['tns','personal-b','focus','personal-a']);
  assert.deepEqual(order.mergeSidebarGroupOrder(['tns'], ['personal-b','personal-a']), ['tns','personal-b','personal-a']);
});
