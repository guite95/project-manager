'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/erp/button';
import { collectionBusy, collectionReportReason, collectionStates, jobSources, sourceReasons, type CollectionStatus, type ManualCollection } from '@/lib/recruitment-jobs';

const timeFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function time(value: string) { return timeFormat.format(new Date(value)); }
async function json<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '수집 요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  return data;
}

export function JobCollectionControl({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const requestVersion = useRef(0);
  const sending = useRef(false);
  const previous = useRef<ManualCollection | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    let controller: AbortController | undefined;
    async function load() {
      if (sending.current) return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const version = ++requestVersion.current;
      try {
        const next = await json<CollectionStatus>(await fetch('/api/recruitment/jobs/collect', { signal, cache: 'no-store' }));
        if (signal.aborted || sending.current || version !== requestVersion.current) return;
        const before = previous.current;
        const current = next.request;
        previous.current = current;
        setStatus(next);
        setStatusError('');
        if (current && !collectionBusy(current) && (before?.runKey !== current.runKey || collectionBusy(before))) onCompleteRef.current();
      } catch (failure) {
        if (!signal.aborted && version === requestVersion.current) setStatusError(failure instanceof Error ? failure.message : '수집 상태를 불러오지 못했습니다.');
      }
    }
    const visibleLoad = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    const timer = window.setInterval(visibleLoad, 5000);
    window.addEventListener('focus', visibleLoad);
    document.addEventListener('visibilitychange', visibleLoad);
    return () => {
      controller?.abort();
      ++requestVersion.current;
      window.clearInterval(timer);
      window.removeEventListener('focus', visibleLoad);
      document.removeEventListener('visibilitychange', visibleLoad);
    };
  }, [refresh]);

  async function start() {
    if (sending.current || collectionBusy(status?.request)) return;
    sending.current = true;
    ++requestVersion.current;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const result = await json<{ created: boolean; request: ManualCollection }>(await fetch('/api/recruitment/jobs/collect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }));
      previous.current = result.request;
      setStatus(current => ({ ...current, workerOnline: current?.workerOnline ?? false, workerSeenAt: current?.workerSeenAt ?? null, request: result.request }));
      setNotice(result.created ? '수집을 요청했습니다. 화면을 닫아도 요청은 유지됩니다.' : '이미 대기하거나 실행 중인 수집 요청이 있습니다.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '수집을 요청하지 못했습니다.');
    } finally {
      sending.current = false;
      setSubmitting(false);
      setRefresh(value => value + 1);
    }
  }

  const request = status?.request;
  const busy = collectionBusy(request);
  return <section aria-label="공고 수집" className="space-y-3 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-semibold">공고 수집</h2><p className="mt-1 text-xs leading-5 text-[var(--bi-muted)]">매일 오후 8시(한국 시간) 예약 · 필요할 때 직접 수집할 수 있습니다.</p></div>
      <Button className="min-h-11" loading={submitting} disabled={!status || busy} onClick={() => void start()}>{busy ? request?.state === 'RUNNING' ? '수집 중' : '실행 대기' : '지금 수집'}</Button>
    </div>
    <p className="text-xs text-[var(--bi-muted)]">{!status ? '워커 상태를 확인하는 중…' : status.workerOnline ? '워커 연결됨 · 요청은 약 30초 안에 확인하며, 진행 중인 수집이 있으면 순서대로 처리합니다.' : '워커 연결이 확인되지 않습니다. 수집 요청은 연결 후 처리됩니다.'}</p>
    {!!status?.sources?.length && <ul aria-label="플랫폼 연결 상태" className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-[var(--bi-muted)]">
      {status.sources.map(source => <li key={source.id}>{jobSources[source.id]} · {source.enabled ? '수집 설정됨' : sourceReasons[source.reason ?? ''] ?? '연결 확인 필요'}</li>)}
    </ul>}
    {(error || statusError) && <p role="alert" className="text-xs text-[var(--bi-error)]">{error || statusError}</p>}
    {notice && <p role="status" className="text-xs text-[var(--bi-accent)]">{notice}</p>}
    {request && <div role="status" className="space-y-2 border-t border-[var(--bi-border)] pt-3 text-xs leading-5">
      <p><span className="font-semibold">최근 실행 요청: {collectionStates[request.state]}</span><span className="ml-2 text-[var(--bi-muted)]">요청 {time(request.requestedAt)}{request.finishedAt ? ` · 종료 ${time(request.finishedAt)}` : ''}</span></p>
      {request.state === 'FAILED' && <p className="text-[var(--bi-error)]">수집을 완료하지 못했습니다. 워커 상태를 확인한 뒤 다시 요청해 주세요.</p>}
      {request.state === 'PARTIAL' && <p className="text-[var(--bi-muted)]">실행 가능한 범위의 수집을 마쳤습니다. 플랫폼별 대기 사유와 수집 상한·오류를 확인해 주세요.</p>}
      {request.reports.length > 0 && <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--bi-muted)]">{request.reports.map(report => <li key={report.source}>
        {jobSources[report.source]} · {report.state === 'DISABLED' ? sourceReasons[report.reason ?? ''] ?? '연결 확인 필요' : report.state === 'SKIPPED' ? '다른 수집 종료 대기' : collectionStates[report.state]}
        {report.stored !== undefined ? ` · 저장 ${report.stored}건` : ''}{report.excluded ? ` · 삭제 이력 제외 ${report.excluded}건` : ''}
        {collectionReportReason(report) ? ` · ${collectionReportReason(report)}` : ''}
      </li>)}</ul>}
    </div>}
  </section>;
}
