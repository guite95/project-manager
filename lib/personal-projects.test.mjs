import test from 'node:test';
import assert from 'node:assert/strict';
import * as personal from './personal-projects.ts';
import { hasProjectNotes } from './project-notes.ts';
import { searchSidebarProjects } from './navigation/sidebar-search.ts';
import * as order from './navigation/sidebar-order.ts';

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
