import assert from 'node:assert/strict';
import test from 'node:test';
import * as board from './today-board.ts';
import { groupCompletionsByDate } from './completions.ts';

test('개인 프로젝트는 소속과 순서를 유지하며 개인 이슈 탭에만 표시한다', () => {
  const projects = [
    {slug:'tns',title:'티앤에스'},
    {slug:'personal-ilchul',title:'ilchul'},
    {slug:'personal-flight-app',title:'flight-app'},
    {slug:'personal-project-management',title:'project-management'},
  ];
  const issues = ['tns', 'personal-ilchul', 'personal-flight-app', 'personal-project-management', board.PERSONAL_ISSUES_SLUG, 'missing']
    .map(projectSlug => ({id:projectSlug,projectSlug,title:'할 일',createdAt:'2026-09-17T00:00:00Z'}));
  let state = {...board.createBoard(),issues};
  state = board.returnToPool(board.sendToToday(state,'personal-ilchul'),'personal-ilchul');
  const groups = board.groupIssuesByProject(state.issues, projects, [], ['personal-flight-app','tns','personal-ilchul']);
  const tabs = board.splitIssuePoolGroups(groups);
  assert.deepEqual(tabs.projectGroups.map(g=>g.slug), ['tns',null]);
  assert.deepEqual(tabs.personalGroups.map(g=>g.slug), ['__personal_issues__','personal-flight-app','personal-ilchul','personal-project-management']);
  assert.equal(tabs.personalGroups.find(g=>g.slug==='personal-ilchul').issues[0].projectSlug,'personal-ilchul');
  assert.equal(tabs.personalGroups.find(g=>g.slug==='personal-ilchul').title,'ilchul');
  const displayed = [...tabs.projectGroups,...tabs.personalGroups].flatMap(g=>g.issues.map(i=>i.id));
  assert.deepEqual(displayed.sort(), issues.map(i=>i.id).sort());
});

test('할 일이 없어도 개인 공용 목록과 개인 프로젝트에 새 할 일을 추가할 수 있다', () => {
  const tabs = board.splitIssuePoolGroups(board.groupIssuesByProject([], [{slug:'personal-ilchul',title:'ilchul'}]));
  assert.equal(tabs.projectGroups.length,0);
  assert.deepEqual(tabs.personalGroups.map(g=>[g.slug,g.canAdd,g.issues.length]), [
    ['__personal_issues__',true,0], ['personal-ilchul',true,0],
  ]);
});

test('개인 이슈를 프로젝트 및 미분류와 분리하고 오늘 목록을 왕복해도 구분을 보존한다', () => {
  assert.equal(typeof board.PERSONAL_ISSUES_SLUG, 'string');
  const issue = {id:'personal',projectSlug:board.PERSONAL_ISSUES_SLUG,title:'운동',createdAt:'2026-09-15T00:00:00Z'};
  const state = {...board.createBoard(),issues:[issue,{...issue,id:'work',projectSlug:'tns'},{...issue,id:'unknown',projectSlug:'missing'}]};
  const groups=board.groupIssuesByProject(state.issues,[{slug:'tns',title:'티앤에스'}]);
  assert.deepEqual(groups.map(g=>[g.title,g.issues.map(i=>i.id)]),[['티앤에스',['work']],['개인',['personal']],['미분류',['unknown']]]);
  const moved=board.sendToToday(state,issue.id);
  assert.equal(moved.today[0].projectSlug,board.PERSONAL_ISSUES_SLUG);
  const returned=board.returnToPool(moved,issue.id);
  assert.equal(returned.issues.find(i=>i.id===issue.id).projectSlug,board.PERSONAL_ISSUES_SLUG);
  const history=groupCompletionsByDate([{...issue,completedOn:'2026-09-15',completedAt:issue.createdAt}],[]);
  assert.equal(history[0].groups[0].title,'개인');
});
