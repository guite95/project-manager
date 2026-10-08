import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { parseIssueSchedule, TaskScheduleError } from '../task-schedule.ts';
import { todayDateString } from '../today-board.ts';

function load(relative, imports) {
  const output = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
class AccessError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
class NextResponse extends Response {
  static json(value, init) { return Response.json(value, init); }
}
function harness() {
  let actor = { role: 'OWNER' }, saveError = null;
  const calls = [];
  const next = { NextResponse };
  const http = load('../access/http.ts', {
    'next/headers': { cookies: async () => ({ get: () => undefined }) }, 'next/server': next, react: { cache: fn => fn },
    '../session.ts': {}, './store.ts': { AccessError, resolveActor: async () => actor },
    '../server/task-access.ts': { loadTaskAccess: async actor => {
      if (!['OWNER', 'ADMIN'].includes(actor.role)) throw new AccessError('접근 불가', 403);
      return { hiddenProjectSlugs: actor.role === 'OWNER' ? [] : ['private'] };
    } },
  });
  const imports = {
    'next/server': next, '@/lib/access/http': http,
    '@/lib/api-types': load('../api-types.ts', { 'next/server': next }),
    '@/lib/today-board': { todayDateString }, '@/lib/task-schedule': { parseIssueSchedule, TaskScheduleError },
    '@/lib/server/board-store': {
      loadBoard: async () => { calls.push(['board']); return {}; },
      createIssue: async input => { calls.push(['create', input]); return input; },
      IssueProjectHiddenError: class extends Error {},
      setIssueTitle: async () => calls.push(['title']), moveIssue: async () => calls.push(['move']), setIssueDone: async () => calls.push(['done']),
    },
    '@/lib/server/task-schedule-store': {
      listScheduleTasks: async access => { calls.push(['list', access]); return []; },
      setIssueSchedule: async (id, schedule, access) => { calls.push(['save', id, schedule, access]); if (saveError) throw saveError; return { ...schedule, revision: schedule.revision + 1 }; },
    },
  };
  return { calls, actor: value => { actor = value; }, fail: value => { saveError = value; },
    board: load('../../app/api/board/route.ts', imports),
    item: load('../../app/api/issues/[id]/route.ts', imports),
    issues: load('../../app/api/issues/route.ts', imports),
  };
}
const schedule = { startDate: '2026-10-08', endDate: '2026-10-12', revision: 0 };
const url = 'https://app.test/api/issues/task-1';
const context = { params: Promise.resolve({ id: 'task-1' }) };
const request = (body = { schedule }, origin = 'https://app.test', contentType = 'application/json') => new Request(url, {
  method: 'PATCH', headers: { ...(origin ? { origin } : {}), 'Content-Type': contentType }, body: JSON.stringify(body),
});

test('간트 조회와 일정 변경도 세션·할 일 권한을 저장소보다 먼저 검증한다', async () => {
  const h = harness();
  for (const actor of [null, { role: 'MEMBER' }]) {
    h.actor(actor);
    for (const response of [await h.board.GET(new Request('https://app.test/api/board?view=gantt')), await h.item.PATCH(request(), context), await h.issues.POST(request({ projectSlug: 'common', title: '할 일', schedule }))]) {
      assert.equal(response.status, actor ? 403 : 401);
    }
  }
  assert.deepEqual(h.calls, []);
});

test('간트 조회는 읽기 전용 경로에 권한 범위를 전달하고 기존 보드 조회를 실행하지 않는다', async () => {
  const h = harness(); h.actor({ role: 'ADMIN' });
  const response = await h.board.GET(new Request('https://app.test/api/board?view=gantt'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(h.calls, [['list', { hiddenProjectSlugs: ['private'] }]]);
  await h.board.GET(new Request('https://app.test/api/board'));
  assert.deepEqual(h.calls.at(-1), ['board']);
});

test('일정 변경은 같은 출처·JSON·날짜·단일 변경을 검증하고 충돌을 409로 전달한다', async () => {
  const h = harness();
  for (const [input, status] of [[request({ schedule }, 'https://other.test'), 403], [request({ schedule }, ''), 403],
    [request({ schedule }, 'https://app.test', 'text/plain'), 415], [request({ schedule: { ...schedule, endDate: '2026-01-01' } }), 400],
    [request({ schedule, done: true }), 400], [request({ schedule: null }), 400]]) {
    assert.equal((await h.item.PATCH(input, context)).status, status);
  }
  assert.deepEqual(h.calls, []);
  const response = await h.item.PATCH(request(), context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ...schedule, revision: 1 });
  h.fail(new TaskScheduleError('수정 충돌', 409));
  assert.equal((await h.item.PATCH(request(), context)).status, 409);
  h.fail(new TaskScheduleError('없음', 404));
  assert.equal((await h.item.PATCH(request(), context)).status, 404);
});

test('새 TODO는 일정과 함께 저장하되 잘못된 기간이면 이슈도 생성하지 않는다', async () => {
  const h = harness();
  assert.equal((await h.issues.POST(request({ projectSlug: 'common', title: '새 TODO', schedule }, 'https://other.test'))).status, 403);
  for (const value of [{ ...schedule, revision: 1 }, { ...schedule, endDate: null }]) {
    assert.equal((await h.issues.POST(request({ projectSlug: 'common', title: '새 TODO', schedule: value }))).status, 400);
  }
  assert.deepEqual(h.calls, []);
  const response = await h.issues.POST(request({ projectSlug: 'common', title: '새 TODO', schedule }));
  assert.equal(response.status, 201);
  assert.deepEqual(h.calls[0][1].schedule, schedule);
});
