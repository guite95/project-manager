import assert from 'node:assert/strict';
import test from 'node:test';
import * as board from './today-board.ts';
import { groupCompletionsByDate } from './completions.ts';

test('표시 해제한 프로젝트의 이슈는 미분류로 새지 않으며 다시 표시하면 복원된다', () => {
  const projects = [
    { slug: 'company', title: '회사', scope: 'COMPANY', showInTasks: true },
    { slug: 'hidden', title: '숨긴 개인', scope: 'PERSONAL', showInTasks: false },
  ];
  const issues = ['company', 'hidden', board.PERSONAL_ISSUES_SLUG, 'unknown'].map(projectSlug => ({ id: projectSlug, projectSlug, title: projectSlug, createdAt: '2026-09-22T00:00:00Z' }));
  const before = structuredClone(issues);
  const groups = board.groupIssuesByProject(issues, projects);
  assert.equal(groups.some(group => group.slug === 'hidden'), false);
  assert.deepEqual(groups.find(group => group.slug === null).issues.map(issue => issue.id), ['unknown']);
  assert(board.splitIssuePoolGroups(groups).personalGroups.some(group => group.slug === board.PERSONAL_ISSUES_SLUG));
  const restored = board.groupIssuesByProject(issues, projects.map(project => ({ ...project, showInTasks: true })));
  assert.equal(restored.find(group => group.slug === 'hidden').issues[0].id, 'hidden');
  assert.deepEqual(issues, before);
});

test('개인 프로젝트는 소속과 순서를 유지하며 개인 이슈 탭에만 표시한다', () => {
  const projects = [
    {slug:'tns',title:'티앤에스'},
    {slug:'personal-ilchul', scope:'PERSONAL',title:'ilchul'},
    {slug:'personal-flight-app', scope:'PERSONAL',title:'flight-app'},
    {slug:'personal-project-management', scope:'PERSONAL',title:'project-management'},
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
  const tabs = board.splitIssuePoolGroups(board.groupIssuesByProject([], [{slug:'personal-ilchul', scope:'PERSONAL',title:'ilchul'}]));
  assert.equal(tabs.projectGroups.length,0);
  assert.deepEqual(tabs.personalGroups.map(g=>[g.slug,g.canAdd,g.issues.length]), [
    ['__personal_issues__',true,0], ['personal-ilchul',true,0],
  ]);
});

test('프로젝트 탭 선택은 현재 프로젝트를 유지하고 사라지면 첫 프로젝트로 이동한다', () => {
  const groups = [
    {slug:'tns',title:'티앤에스',canAdd:true,removable:false,issues:[]},
    {slug:'focus-ai',title:'Focus AI',canAdd:true,removable:false,issues:[]},
  ];

  assert.equal(board.selectIssueGroup(groups, 'focus-ai')?.slug, 'focus-ai');
  assert.equal(board.selectIssueGroup(groups, 'removed-project')?.slug, 'tns');
  assert.equal(board.selectIssueGroup([], 'tns'), null);
});

test('미분류 프로젝트도 고유한 탭으로 선택할 수 있다', () => {
  const groups = [
    {slug:'tns',title:'티앤에스',canAdd:true,removable:false,issues:[]},
    {slug:null,title:'미분류',canAdd:false,removable:false,issues:[]},
  ];

  assert.equal(board.selectIssueGroup(groups, board.UNGROUPED_ISSUE_TAB)?.slug, null);
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
