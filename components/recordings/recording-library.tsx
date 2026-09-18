'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAccess } from '@/components/access/context';
import { Button } from '@/components/erp/button';
import { Dropdown } from '@/components/erp/dropdown';
import { TextField } from '@/components/erp/form-field';
import { MAX_RECORDING_BYTES, RECORDING_KINDS, RECORDING_STATUS, type RecordingSummary } from '@/lib/recordings';

const field = 'block w-full rounded border border-[var(--bi-border)] bg-[var(--bi-bg)] p-2 text-[13px]';
export function RecordingLibrary({ project, projectTitle, initial }: { project: string; projectTitle: string; initial: RecordingSummary[] }) {
  const { canWrite } = useAccess();
  const writable = canWrite(project);
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('');
  const [context, setContext] = useState('');
  const [query, setQuery] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ id: string; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const previewVersion = useRef(0);
  const base = `/api/flows/${encodeURIComponent(project)}/recordings`;
  async function json(response: Response) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? '요청을 처리하지 못했습니다.');
    return data;
  }
  async function refresh() {
    setRows(await json(await fetch(base, { cache: 'no-store' })));
    setRefreshError('');
  }
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (document.hidden || loading) return;
      loading = true;
      try {
        const response = await fetch(base, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted) { setRows(data); setRefreshError(''); }
      } catch { if (!controller.signal.aborted) setRefreshError('상태를 갱신하지 못했습니다. 잠시 후 다시 확인합니다.'); }
      finally { loading = false; }
    };
    const timer = setInterval(load, 10_000);
    window.addEventListener('focus', load);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', load); };
  }, [base]);
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const data = new FormData();
      data.set('file', file); data.set('title', title); data.set('kind', kind); data.set('context', context);
      await json(await fetch(base, { method: 'POST', body: data }));
      setAdding(false); setTitle(''); setKind(''); setContext(''); setFile(null);
      if (input.current) input.current.value = '';
      setNotice('녹음 원본을 저장하고 전사를 요청했습니다. 이 페이지를 닫아도 작업은 계속됩니다.');
      try { await refresh(); } catch { setRefreshError('업로드는 완료됐지만 목록을 갱신하지 못했습니다. 잠시 후 다시 확인합니다.'); }
    } catch (error) { setError(error instanceof Error ? error.message : '업로드를 완료하지 못했습니다.'); }
    finally { setBusy(false); lock.current = false; }
  }
  async function retry(id: string) {
    if (lock.current) return;
    lock.current = true; setRetrying(id); setError('');
    try { await json(await fetch(`${base}/${id}/retry`, { method: 'POST' })); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : '재시도하지 못했습니다.'); }
    finally { setRetrying(null); lock.current = false; }
  }
  async function showTranscript(id: string) {
    const version = ++previewVersion.current;
    if (preview?.id === id) { setPreview(null); return; }
    setError('');
    try {
      const data = await json(await fetch(`${base}/${id}/text`, { cache: 'no-store' }));
      if (version === previewVersion.current) setPreview({ id, text: data.text });
    } catch { setError('전사본을 불러오지 못했습니다.'); }
  }
  const filtered = rows.filter(row => `${row.title} ${row.fileName} ${row.context} ${RECORDING_KINDS.find(k => k.value === row.kind)?.label}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="mx-auto max-w-[1400px] p-4 md:p-6">
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="flex-1"><p className="text-xs text-[var(--bi-muted)]">{projectTitle}</p><h1 className="mt-1 text-lg font-semibold">녹음·전사</h1></div>
      {writable && <Button onClick={() => setAdding(true)}>녹음 올리기</Button>}
    </div>
    <p className="mb-5 text-[13px] text-[var(--bi-muted)]">녹음 원본과 전사본을 각각 보관합니다. 원본은 업로드 후, 전사본은 전사 완료 후 내려받을 수 있습니다.</p>
    {adding && writable && <form onSubmit={upload} className="mb-6 space-y-4 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4">
      <h2 className="font-semibold">녹음 올리기</h2>
      <label className="block space-y-2 text-xs">녹음 파일
        <input ref={input} type="file" accept=".m4a,.mp3,.wav,.flac,.ogg,.webm" required disabled={busy} className={field} aria-describedby="recording-help" onChange={event => {
          const next = event.target.files?.[0] ?? null; setError('');
          if (next && (!next.size || next.size > MAX_RECORDING_BYTES || !/\.(m4a|mp3|wav|flac|ogg|webm)$/i.test(next.name))) {
            setError('지원하는 녹음 파일을 선택해 주세요. 파일당 최대 100MB입니다.'); setFile(null); event.target.value = ''; return;
          }
          setFile(next); if (next) setTitle(next.name.replace(/\.[^.]+$/, '').slice(0, 200));
        }} />
      </label>
      <p id="recording-help" className="text-xs text-[var(--bi-muted)]">M4A(AAC)·MP3·WAV·FLAC·OGG(Opus)·WebM(Opus), 최대 100MB. Google Chirp 3로 전사합니다.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="제목" value={title} onChange={value => setTitle(value.slice(0, 200))} required disabled={busy} />
        <div><p className="mb-1 text-xs text-[var(--bi-muted)]">녹음 종류</p><Dropdown value={kind} onChange={setKind} options={RECORDING_KINDS} ariaLabel="녹음 종류" disabled={busy} /></div>
      </div>
      <label className="block space-y-2 text-xs">녹음 상황 설명 · 선택
        <textarea className={field} value={context} onChange={event => setContext(event.target.value)} disabled={busy} maxLength={1000} rows={3} placeholder="예: 고객과 전화로 진행한 장애 상담. 풀링, 티앤에스 등의 고유명사가 나옵니다." />
      </label>
      <p className="text-xs text-[var(--bi-muted)]">종류와 설명은 전사 시 참고 정보로 전달됩니다. 들리지 않은 내용을 보충하는 근거로 사용하지 않습니다.</p>
      <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setAdding(false)}>취소</Button><Button type="submit" loading={busy} disabled={!file || !kind || !title.trim() || !!retrying}>올리고 전사하기</Button></div>
    </form>}
    {error && <p role="alert" className="mb-4 text-sm text-[var(--bi-error)]">{error}</p>}
    {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
    {refreshError && <p role="status" className="mb-4 text-xs text-[var(--bi-muted)]">{refreshError}</p>}
    <div className="mb-4 max-w-sm"><TextField type="search" label={`녹음 검색 · ${rows.length}개`} value={query} onChange={setQuery} placeholder="제목·파일명·종류·설명 검색" /></div>
    <div className="space-y-3">
      {!filtered.length && <p className="rounded border border-[var(--bi-border)] p-6 text-sm text-[var(--bi-muted)]">{rows.length ? '검색 결과가 없습니다.' : '아직 등록된 녹음이 없습니다.'}</p>}
      {filtered.map(row => <article key={row.id} className="rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4">
        <div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><h2 className="break-words font-semibold">{row.title}</h2><p className="mt-1 break-words text-xs text-[var(--bi-muted)]">{RECORDING_KINDS.find(k => k.value === row.kind)?.label} · {row.fileName} · {(row.byteLength / 1024 / 1024).toFixed(1)} MB · {row.createdAt.slice(0, 10)}</p></div><span className="text-xs font-semibold">{RECORDING_STATUS[row.status]}</span></div>
        {row.context && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{row.context}</p>}
        {row.error && <p className="mt-3 text-xs text-[var(--bi-error)]">{row.error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <a className="text-[var(--bi-accent)] hover:underline" href={`${base}/${row.id}/audio`} download>녹음 원본 다운로드</a>
          {row.hasTranscript ? <><a className="text-[var(--bi-accent)] hover:underline" href={`${base}/${row.id}/transcript`} download>전사본 TXT 다운로드</a><Button variant="secondary" onClick={() => showTranscript(row.id)}>{preview?.id === row.id ? '전사본 닫기' : '전사본 보기'}</Button></> : <span className="text-xs text-[var(--bi-muted)]">전사 완료 후 TXT 다운로드</span>}
          {row.status === 'FAILED' && writable && <Button variant="secondary" disabled={busy || !!retrying} loading={retrying === row.id} onClick={() => retry(row.id)}>전사 재시도</Button>}
        </div>
        {preview?.id === row.id && <pre className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded bg-[var(--bi-bg)] p-4 font-sans text-sm leading-7">{preview.text}</pre>}
      </article>)}
    </div>
  </div>;
}
