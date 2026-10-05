import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CollectionError, errorCode } from './config.mjs';
import { collectSource } from './collect.mjs';
import { dueScheduleKey } from './schedule.mjs';

export async function runCollection(config, { store, runKey = `manual-${randomUUID()}`, signal, collect = collectSource, heartbeat } = {}) {
  const reports = [], preview = [];
  for (const source of config.sources) {
    if (!source.enabled) { reports.push({ source: source.id, state: 'DISABLED', reason: source.disabledReason ?? 'NOT_CONFIGURED' }); continue; }
    signal?.throwIfAborted();
    await heartbeat?.();
    const claim = store ? await store.claim(source.id, runKey) : null;
    if (store && !claim) {
      const completed = await store.completedReport?.(source.id, runKey);
      reports.push(completed ?? { source: source.id, state: 'SKIPPED', reason: 'ALREADY_CLAIMED_OR_FINISHED' });
      continue;
    }
    try {
      const result = await collect(source, config, {
        signal, pendingUrls: claim?.pendingUrls ?? [], refreshUrls: claim?.refreshUrls ?? [],
        heartbeat: store ? async () => { await heartbeat?.(); await store.heartbeat(claim); } : heartbeat,
      });
      signal?.throwIfAborted();
      await heartbeat?.();
      let savedReport;
      if (store) savedReport = await store.finish(claim, result);
      else preview.push(...result.jobs.map(({ description: _description, ...summary }) => summary));
      reports.push(savedReport ?? result.report);
    } catch (error) {
      const code = errorCode(error);
      // 저장 실패/중단 후에는 만료된 lease를 통해 같은 회차를 다시 시도할 수 있다.
      // 토큰이 바뀌었으면 오래된 작업자는 어떤 결과도 저장하지 않는다.
      if (signal?.aborted || code === 'ABORTED') throw new CollectionError('ABORTED');
      reports.push({ source: source.id, state: 'FAILED', error: code });
    }
  }
  return { mode: store ? 'apply' : 'dry-run', runKey, reports, ...(store ? {} : { preview }) };
}

export async function runManualRequest(config, { store, signal, run = runCollection } = {}) {
  const claim = await store.claimManual();
  if (!claim) return null;
  try {
    const heartbeat = async () => {
      try { await store.touchWorker(config.sources); await store.heartbeatManual(claim); }
      catch { throw new CollectionError('LEASE_LOST'); }
    };
    await heartbeat();
    const result = await run(config, { store, signal, runKey: claim.runKey, heartbeat });
    signal?.throwIfAborted();
    const hasFailure = result.reports.some(report => report.error || report.state === 'FAILED');
    const hasCollected = result.reports.some(report => ['SUCCESS', 'PARTIAL'].includes(report.state));
    const state = hasFailure ? (hasCollected ? 'PARTIAL' : 'FAILED')
      : result.reports.some(report => report.state === 'SKIPPED') ? 'QUEUED'
      : result.reports.some(report => report.state === 'PARTIAL' || report.state === 'DISABLED' && report.reason !== 'DEFERRED') ? 'PARTIAL' : 'SUCCESS';
    return await store.finishManual(claim, { state, reports: result.reports });
  } catch (error) {
    if (signal?.aborted || errorCode(error) === 'ABORTED') throw new CollectionError('ABORTED');
    // 소유권을 잃었으면 이전 작업자가 새 상태를 덮어쓰지 않는다.
    if (errorCode(error) === 'LEASE_LOST') throw error;
    return await store.finishManual(claim, { state: 'FAILED', error: errorCode(error) });
  }
}

/** 20시 이후 재시작하면 당일 미완료 회차만 실행한다. 실행 여부는 DB가 결정한다. */
export async function watchCollections(config, { store, signal, now = () => new Date(), wait = delay, emit = () => {}, run = runCollection } = {}) {
  if (!store) throw new CollectionError('STORE_REQUIRED');
  let completedKey = null;
  while (!signal?.aborted) {
    await store.touchWorker?.(config.sources);
    const runKey = dueScheduleKey(now());
    if (runKey && runKey !== completedKey) {
      const result = await run(config, { store, runKey, signal, heartbeat: () => store.touchWorker?.(config.sources) });
      if (result.reports.some(report => report.state !== 'SKIPPED')) emit(result);
      // 예외로 끝난 회차는 lease 만료 후 최대 3회 재개한다.
      // 정상 저장된 FAILED/PARTIAL도 같은 날 자동으로 반복 수집하지 않는다.
      if (result.reports.every(report => report.state !== 'SKIPPED' && !report.error)) completedKey = runKey;
    }
    if (!signal?.aborted && store.claimManual) {
      const manual = await runManualRequest(config, { store, signal, run });
      if (manual) emit({ mode: 'manual-request', ...manual });
    }
    try { await wait(30000, undefined, { signal }); }
    catch (error) { if (!signal?.aborted) throw error; }
  }
}
