'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/erp/button';
import { JobCollectionControl } from './job-collection-control';
import { buttonClassName } from '@/components/erp/button-styles';
import { jobSources, jobStatuses, type JobDetail, type JobPage, type JobSummary } from '@/lib/recruitment-jobs';

const fieldClass = 'min-h-11 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 text-sm text-[var(--bi-fg)] focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]';
const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '미확인';
}
async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '공고를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return body as T;
}

export function RecruitmentJobs() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<JobPage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const listVersion = useRef(0);
  const mutating = useRef(false);
  const detailPanel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (selectedId) detailPanel.current?.focus({ preventScroll: window.matchMedia('(min-width: 1280px)').matches });
  }, [selectedId]);

  useEffect(() => {
    let controller: AbortController | undefined;
    setData(null);
    const load = async () => {
      if (mutating.current) return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const version = ++listVersion.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, source, status, page: String(page) });
        const result = await responseJson<JobPage>(await fetch(`/api/recruitment/jobs?${params}`, { signal, cache: 'no-store' }));
        if (signal.aborted || version !== listVersion.current || mutating.current) return;
        const lastPage = Math.max(1, Math.ceil(result.total / result.limit));
        if (page > lastPage) { setPage(lastPage); return; }
        setData(result);
        setError('');
        setSelectedId(current => result.items.some(job => job.id === current) ? current : null);
      } catch (failure) {
        if (!signal.aborted && version === listVersion.current && !mutating.current) setError(failure instanceof Error ? failure.message : '공고 목록을 불러오지 못했습니다.');
      } finally {
        if (!signal.aborted && version === listVersion.current) setLoading(false);
      }
    };
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    const timer = window.setInterval(onFocus, 15000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      controller?.abort();
      ++listVersion.current;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [query, source, status, page, refresh]);

  useEffect(() => {
    setDetail(null);
    setDetailError('');
    if (!selectedId) { setDetailLoading(false); return; }
    const controller = new AbortController();
    setDetailLoading(true);
    void fetch(`/api/recruitment/jobs/${selectedId}`, { signal: controller.signal, cache: 'no-store' })
      .then(response => responseJson<JobDetail>(response))
      .then(job => { if (!controller.signal.aborted) setDetail(job); })
      .catch(failure => { if (!controller.signal.aborted) setDetailError(failure instanceof Error ? failure.message : '공고 본문을 불러오지 못했습니다.'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, refresh]);

  async function remove(job: JobSummary) {
    if (mutating.current || !window.confirm(`“${job.title}” 공고를 삭제할까요?\n\n같은 사이트의 동일한 원문 주소에 속한 공고도 함께 삭제됩니다. 다시 수집돼도 표시하지 않으며, 삭제는 되돌릴 수 없습니다.`)) return;
    mutating.current = true;
    ++listVersion.current;
    setDeleting(job.id);
    setDeleteError('');
    setNotice('');
    try {
      await responseJson(await fetch(`/api/recruitment/jobs/${job.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
      setData(current => current ? { ...current, items: current.items.filter(item => item.source !== job.source || item.url !== job.url) } : null);
      setSelectedId(null);
      setDetail(null);
      setNotice('삭제했습니다. 같은 원문 주소의 공고는 다시 수집돼도 표시하지 않습니다.');
    } catch (failure) {
      setDeleteError(failure instanceof Error ? failure.message : '삭제하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      mutating.current = false;
      setDeleting(null);
      setRefresh(value => value + 1);
    }
  }

  const selected = detail?.id === selectedId ? detail : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : page;
  return <div className="space-y-4 p-4 md:p-6">
    <JobCollectionControl onComplete={() => setRefresh(value => value + 1)} />
    <p className="text-xs leading-5 text-[var(--bi-muted)]">삭제한 공고는 같은 사이트의 원문 주소를 기준으로 계속 제외합니다. 다른 사이트에 올라온 공고는 별도 항목입니다.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()); }}>
      <label className="grid min-w-48 flex-1 gap-1.5 text-xs font-medium">공고 검색
        <input type="search" maxLength={150} value={search} onChange={event => setSearch(event.target.value)} placeholder="공고명, 회사, 지역" className={fieldClass} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium">채용 사이트
        <select value={source} onChange={event => { setSource(event.target.value); setPage(1); }} className={fieldClass}>
          <option value="">전체 사이트</option>{Object.entries(jobSources).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-medium">모집 상태
        <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className={fieldClass}>
          <option value="">전체 상태</option>{Object.entries(jobStatuses).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <Button type="submit" className="min-h-11" disabled={!!deleting}>검색</Button>
      <Button variant="secondary" className="min-h-11" disabled={loading || !!deleting} onClick={() => setRefresh(value => value + 1)}>새로고침</Button>
    </form>
    {(error || deleteError) && <p role="alert" className="text-sm text-[var(--bi-error)]">{deleteError || error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--bi-accent)]">{notice}</p>}
    <div className="flex items-center justify-between gap-3 text-xs text-[var(--bi-muted)]">
      <p role="status">{loading && !data ? '공고를 불러오는 중…' : data ? `검색 결과 ${data.total.toLocaleString()}건 · 처음 수집한 날짜순` : '목록을 불러오지 못했습니다.'}</p>
      <span>한국 시간 기준</span>
    </div>
    <div className={`grid min-w-0 gap-4 ${selectedId ? 'xl:grid-cols-2' : ''}`}>
      <section aria-label="채용공고 목록" aria-busy={loading} className="min-w-0">
        {data?.items.length === 0 && <div className="rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-8 text-center text-sm text-[var(--bi-muted)]">
          {query || source || status ? '검색 조건에 맞는 공고가 없습니다.' : '아직 수집된 채용공고가 없습니다.'}
        </div>}
        <ul className="space-y-3">
          {data?.items.map(job => <li key={job.id} className={`min-w-0 rounded border bg-[var(--bi-card-bg)] ${selectedId === job.id ? 'border-[var(--bi-accent)]' : 'border-[var(--bi-border)]'}`}>
            <button id={`job-${job.id}`} type="button" aria-expanded={selectedId === job.id} aria-controls="recruitment-job-detail" onClick={() => setSelectedId(job.id)} className="block w-full cursor-pointer rounded p-4 text-left hover:bg-[var(--bi-accent-light)] focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]">
              <span className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--bi-muted)]"><span>{jobSources[job.source]}</span><span className="rounded bg-[var(--bi-bg)] px-2 py-1">{jobStatuses[job.status]}</span></span>
              <span className="block break-words text-sm font-semibold leading-6">{job.title}</span>
              <span className="mt-1 block text-sm">{job.company || '회사 미확인'}</span>
              <span className="mt-2 block break-words text-xs leading-5 text-[var(--bi-muted)]">{job.locations.join(' · ') || '지역 미확인'} · {job.experience || '경력 미확인'}</span>
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--bi-border)] px-4 py-2">
              <span className="text-xs text-[var(--bi-muted)]">마감 {date(job.deadline)}</span>
              <div className="flex gap-1">
                <a href={job.url} target="_blank" rel="noopener noreferrer" className={buttonClassName({ variant: 'ghost', className: 'min-h-11' })} aria-label={`${job.title} 원문 보기 (새 탭)`}>원문 보기 ↗</a>
                <Button variant="danger-ghost" className="min-h-11" loading={deleting === job.id} disabled={!!deleting} aria-label={`${job.title} 삭제`} onClick={() => void remove(job)}>삭제</Button>
              </div>
            </div>
          </li>)}
        </ul>
        {data && data.total > 0 && <nav aria-label="공고 페이지" className="mt-4 flex items-center justify-center gap-3">
          <Button variant="secondary" className="min-h-11" disabled={loading || !!deleting || page <= 1} onClick={() => setPage(value => value - 1)}>이전</Button>
          <span className="text-xs">{page} / {pages}</span>
          <Button variant="secondary" className="min-h-11" disabled={loading || !!deleting || page >= pages} onClick={() => setPage(value => value + 1)}>다음</Button>
        </nav>}
      </section>
      <section ref={detailPanel} tabIndex={-1} id="recruitment-job-detail" aria-label="선택한 공고 본문" aria-busy={detailLoading} hidden={!selectedId} className="order-first min-w-0 self-start rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4 focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)] xl:sticky xl:top-4 xl:order-last">
        <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">공고 상세</h2><Button variant="subtle" className="min-h-11" onClick={() => { document.getElementById(`job-${selectedId}`)?.focus(); setSelectedId(null); }}>닫기</Button></div>
        {detailLoading && <p role="status" className="text-sm text-[var(--bi-muted)]">본문을 불러오는 중…</p>}
        {detailError && <p role="alert" className="text-sm text-[var(--bi-error)]">{detailError}</p>}
        {selected && <>
          <h3 className="break-words text-base font-semibold">{selected.title}</h3>
          <p className="mt-1 text-sm">{selected.company || '회사 미확인'}</p>
          <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs leading-5">
            <dt className="text-[var(--bi-muted)]">고용 형태</dt><dd>{selected.employmentType.join(' · ') || '미확인'}</dd>
            <dt className="text-[var(--bi-muted)]">학력</dt><dd>{selected.education || '미확인'}</dd>
            <dt className="text-[var(--bi-muted)]">등록일</dt><dd>{date(selected.postedAt)}</dd>
            <dt className="text-[var(--bi-muted)]">마감일</dt><dd>{date(selected.deadline)}</dd>
            <dt className="text-[var(--bi-muted)]">최근 수집</dt><dd>{date(selected.lastSeenAt)}</dd>
          </dl>
          {selected.detailStatus === 'UNVERIFIED' && <p className="mb-3 text-xs leading-5 text-[var(--bi-muted)]">페이지에서 추출한 텍스트입니다. 정확한 지원 조건은 원문에서 확인해 주세요.</p>}
          <div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words border-t border-[var(--bi-border)] pt-4 text-sm leading-7">{selected.description || '수집된 본문이 없습니다. 원문 보기를 이용해 주세요.'}</div>
        </>}
      </section>
    </div>
  </div>;
}
