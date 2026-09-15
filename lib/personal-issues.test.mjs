import assert from 'node:assert/strict';
import test from 'node:test';
import * as board from './today-board.ts';
import { groupCompletionsByDate } from './completions.ts';

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
