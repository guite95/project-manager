'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/erp/button';
import { credentialFields, credentialKinds, credentialText, type CredentialField, type CredentialKind, type RecruitmentCredential, type RecruitmentCredentials } from '@/lib/recruitment-credentials';

const fieldClass = 'mt-1 w-full rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 py-2 text-sm';
const fields = Object.entries(credentialFields) as [CredentialField, string][];
async function readResponse(response: Response): Promise<RecruitmentCredentials> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '지원용 정보를 불러오지 못했습니다.');
  return data;
}

export function RecruitmentCredentialsPanel() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<RecruitmentCredentials | null>(null);
  const [draft, setDraft] = useState<RecruitmentCredentials | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const editing = draft !== null;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved);
  const current = draft ?? saved;

  useEffect(() => {
    if (!open || editing) return;
    const abort = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const data = await fetch('/api/portfolio/credentials', { cache: 'no-store', signal: abort.signal }).then(readResponse);
        if (!abort.signal.aborted) { setSaved(data); setError(''); }
      } catch (error) {
        if (!abort.signal.aborted) setError(error instanceof Error ? error.message : '지원용 정보를 불러오지 못했습니다.');
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [open, editing, refreshVersion]);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href]') && !window.confirm('저장하지 않은 지원용 정보가 있습니다. 이동할까요?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty]);

  async function copy(text: string, label: string) {
    setNotice('');
    try { await navigator.clipboard.writeText(text); setNotice(`${label} 복사했습니다.`); }
    catch { setError('복사하지 못했습니다. 표시된 내용을 직접 선택해 복사해 주세요.'); }
  }
  function update(id: string, patch: Partial<RecruitmentCredential>) {
    setDraft(value => value ? { ...value, items: value.items.map(item => item.id === id ? { ...item, ...patch } : item) } : value);
  }
  function add() {
    if (!draft) return;
    const item: RecruitmentCredential = { id: crypto.randomUUID(), kind: 'CERTIFICATE', name: '', issuer: '', acquiredOn: '', identifier: '', grade: '', expiresOn: '', notes: '' };
    setDraft({ ...draft, items: [...draft.items, item] });
  }
  function cancel() {
    if (dirty && !window.confirm('저장하지 않은 지원용 정보 변경을 버릴까요?')) return;
    setDraft(null); setError('');
  }
  function toggle() {
    if (open && dirty && !window.confirm('저장하지 않은 지원용 정보 변경을 버리고 닫을까요?')) return;
    setOpen(!open); setDraft(null); setSaved(null); setError(''); setNotice('');
  }
  async function save() {
    if (!draft) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const data = await fetch('/api/portfolio/credentials', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: draft.items, expectedRevision: draft.revision }),
      }).then(readResponse);
      setSaved(data); setDraft(null); setNotice('지원용 정보를 저장했습니다.');
    } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다. 작성 내용은 유지됩니다.'); }
    finally { setSaving(false); }
  }

  return <section className="mx-4 my-4 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4 md:mx-6 md:p-5" aria-label="나만 보는 지원용 정보">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-semibold">지원용 정보 <span className="ml-2 rounded bg-[var(--bi-bg)] px-2 py-1 text-xs text-[var(--bi-muted)]">나만 보기</span></h2>
        <p className="mt-2 text-xs leading-5 text-[var(--bi-muted)]">자격증·수상·어학 정보를 보관하고 지원서에 복사하세요. 포트폴리오의 ‘내용 복사’에는 포함되지 않습니다.</p></div>
      <Button variant="secondary" disabled={saving} aria-expanded={open} aria-controls="private-credentials" onClick={toggle}>{open ? '상세 정보 숨기기' : '상세 정보 보기'}</Button>
    </div>
    {open && <div id="private-credentials" className="mt-5">
      {error && <p role="alert" className="mb-3 text-sm text-[var(--bi-error)]">{error}</p>}
      <p role="status" className="mb-3 text-xs text-[var(--bi-muted)]">{notice}</p>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        {editing ? <><Button variant="secondary" disabled={saving} onClick={cancel}>취소</Button><Button loading={saving} onClick={save}>지원용 정보 저장</Button></> : <>
          <Button variant="secondary" onClick={() => setRefreshVersion(value => value + 1)}>다시 불러오기</Button>
          <Button disabled={!saved} onClick={() => { if (saved) { setDraft(structuredClone(saved)); setError(''); setNotice(''); } }}>지원용 정보 편집</Button>
        </>}
      </div>
      {!current ? <p className="text-sm text-[var(--bi-muted)]">{error ? '다시 불러오기를 눌러 주세요.' : '지원용 정보를 불러오는 중입니다.'}</p> : <>
        {!current.items.length && <p className="py-5 text-sm text-[var(--bi-muted)]">등록된 정보가 없습니다. 편집에서 항목을 추가하세요.</p>}
        <fieldset disabled={saving} className="grid min-w-0 gap-4 lg:grid-cols-2">
          {current.items.map(item => <section key={item.id} className="min-w-0 rounded border border-[var(--bi-border)] p-4" aria-label={item.name || '새 항목'}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{credentialKinds[item.kind]}{item.name && ` · ${item.name}`}</h3>
              <Button variant="secondary" size="sm" disabled={!item.name.trim()} onClick={() => copy(credentialText(item), '항목 전체를')}>항목 전체 복사</Button>
            </div>
            {editing && <label className="mb-3 block text-xs font-semibold">종류<select className={fieldClass} value={item.kind} onChange={event => update(item.id, { kind: event.target.value as CredentialKind })}>{Object.entries(credentialKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            <div className="space-y-3">
              {fields.map(([key, label]) => <div key={key} className="flex items-start gap-2">
                {editing ? <label className="min-w-0 flex-1 text-xs font-semibold">{label}
                  {key === 'notes' ? <textarea className={fieldClass} maxLength={4000} rows={3} value={item[key]} onChange={event => update(item.id, { [key]: event.target.value })} /> : <input className={fieldClass} maxLength={200} placeholder={key === 'acquiredOn' || key === 'expiresOn' ? 'YYYY / YYYY-MM / YYYY-MM-DD' : undefined} value={item[key]} onChange={event => update(item.id, { [key]: event.target.value })} />}
                </label> : <div className="min-w-0 flex-1"><p className="text-xs text-[var(--bi-muted)]">{label}</p><p className="mt-1 select-text whitespace-pre-wrap break-words text-sm leading-6">{item[key] || '미입력'}</p></div>}
                <Button variant="ghost" size="sm" className={editing ? 'mt-5' : ''} aria-label={`${item.name || '새 항목'} ${label} 복사`} disabled={!item[key]} onClick={() => copy(item[key], `${label}을`)}>복사</Button>
              </div>)}
            </div>
            {editing && <Button variant="ghost" className="mt-4" onClick={() => { if (window.confirm('이 항목을 제거할까요? 저장 전에는 취소할 수 있습니다.')) setDraft(value => value ? { ...value, items: value.items.filter(row => row.id !== item.id) } : value); }}>항목 제거</Button>}
          </section>)}
        </fieldset>
        {editing && <Button className="mt-4" variant="secondary" disabled={saving || current.items.length >= 100} onClick={add}>항목 추가</Button>}
      </>}
    </div>}
  </section>;
}
