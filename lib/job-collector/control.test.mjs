import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CollectionError } from './config.mjs';
import { runCollection, runManualRequest, watchCollections } from './worker.mjs';
import { collectionControl } from './control.mjs';

const config = { sources: [{ id: 'zighang', enabled: true }, { id: 'wanted', enabled: true }] };
function manualStore() {
  const saved = [];
  let owner = null;
  return {
    saved,
    claimManual: async () => owner = { runKey: 'manual-test', token: 'owner' },
    heartbeatManual: async claim => { assert.equal(claim, owner); },
    touchWorker: async () => {},
    finishManual: async (claim, result) => { assert.equal(claim, owner); saved.push(result); return { runKey: claim.runKey, ...result }; },
  };
}

test('수동 요청은 워커에서 실행하며 진행 중인 예약 수집이 있으면 대기 상태를 유지한다', async () => {
  const store = manualStore();
  const result = await runManualRequest(config, { store, run: async (_config, options) => {
    assert.equal(options.runKey, 'manual-test');
    await options.heartbeat();
    return { reports: [{ source: 'zighang', state: 'SUCCESS', stored: 2, excluded: 1 }, { source: 'wanted', state: 'SKIPPED' }] };
  } });
  assert.equal(result.state, 'QUEUED');
  assert.equal(result.reports[0].excluded, 1);
});

test('다른 워커가 처리 중이면 수동 요청을 다시 실행하지 않는다', async () => {
  const store = { claimManual: async () => null };
  assert.equal(await runManualRequest(config, { store, run: async () => assert.fail('중복 실행') }), null);
});

test('요청 소유권을 DB에서 확인할 수 없으면 외부 수집을 시작하지 않는다', async () => {
  const control = collectionControl({ query: async () => { throw new Error('private database error'); } });
  await assert.rejects(() => control.heartbeatManual({ runKey: 'manual-test', token: 'old' }), /LEASE_LOST/);
  const store = { ...manualStore(), touchWorker: async () => { throw new Error('database unavailable'); } };
  await assert.rejects(() => runManualRequest(config, { store, run: async () => assert.fail('외부 수집 금지') }), /LEASE_LOST/);
  assert.deepEqual(store.saved, []);
});

test('재개 시 이미 완료한 사이트의 결과를 재사용하고 남은 사이트만 수집한다', async () => {
  const completed = { source: 'zighang', state: 'SUCCESS', stored: 3, excluded: 1 };
  const collected = [], heartbeats = [];
  const result = await runCollection(config, {
    runKey: 'manual-resume', heartbeat: async () => { heartbeats.push('batch'); },
    store: {
      claim: async source => source === 'zighang' ? null : { source, pendingUrls: [] },
      completedReport: async () => completed,
      heartbeat: async () => { heartbeats.push('source'); },
      finish: async (_claim, result) => result.report,
    },
    collect: async (source, _config, options) => {
      await options.heartbeat();
      collected.push(source.id);
      return { report: { source: source.id, state: 'SUCCESS' }, jobs: [], pendingUrls: [] };
    },
  });
  assert.deepEqual(collected, ['wanted']);
  assert.deepEqual(result.reports[0], completed);
  assert.ok(heartbeats.includes('source'));
  assert.ok(heartbeats.filter(value => value === 'batch').length >= 3);
});

test('수동 수집은 성공·일부 수집·실패를 구분하고 오류가 있으면 무한 대기하지 않는다', async () => {
  for (const [reports, expected] of [
    [[{ state: 'SUCCESS' }], 'SUCCESS'],
    [[{ state: 'PARTIAL' }], 'PARTIAL'],
    [[{ state: 'FAILED', errorCount: 1 }], 'FAILED'],
    [[{ state: 'FAILED', error: 'COLLECTION_FAILED' }, { state: 'SKIPPED' }], 'FAILED'],
  ]) {
    const store = manualStore();
    const result = await runManualRequest(config, { store, run: async () => ({ reports }) });
    assert.equal(result.state, expected);
  }
});

test('종료 신호와 잃어버린 소유권은 완료로 기록하지 않으며 다른 오류는 고정 코드만 남긴다', async () => {
  for (const code of ['ABORTED', 'LEASE_LOST']) {
    const store = manualStore();
    await assert.rejects(() => runManualRequest(config, { store, run: async () => { throw new CollectionError(code); } }), new RegExp(code));
    assert.equal(store.saved.length, 0);
  }
  const store = manualStore();
  const result = await runManualRequest(config, { store, run: async () => { throw new Error('private connection string'); } });
  assert.equal(result.error, 'COLLECTION_FAILED');
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('오후 8시 전에도 수동 요청을 실행하고 그날 오후 8시 예약을 유지한다', async () => {
  const controller = new AbortController(), keys = [];
  const dates = ['2026-10-03T09:00:00Z', '2026-10-03T11:00:00Z', '2026-10-03T11:01:00Z'];
  let index = 0, claimed = false;
  const store = {
    touchWorker: async () => {}, heartbeatManual: async () => {},
    claimManual: async () => { if (claimed) return null; claimed = true; return { runKey: 'manual-before-20' }; },
    finishManual: async (_claim, value) => value,
  };
  await watchCollections(config, {
    store, signal: controller.signal, now: () => new Date(dates[index]),
    wait: async () => { if (++index === dates.length) controller.abort(); },
    run: async (_config, options) => { keys.push(options.runKey); return { reports: [{ state: 'SUCCESS' }] }; },
  });
  assert.deepEqual(keys, ['manual-before-20', '2026-10-03']);
});
