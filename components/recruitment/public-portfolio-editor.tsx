'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/erp/button';
import { PublicPortfolioView } from './public-portfolio-view';
import type { PortfolioLink, PublicPortfolio, PublicPortfolioContent } from '@/lib/public-portfolio';

const field = 'mt-1 w-full rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 py-2 text-sm';
const blank = (): PublicPortfolio => ({ published: false, revision: 0, updatedAt: null, content: { name: '', headline: '', introduction: [''], links: [], strengths: [], skills: [], projects: [], activities: [] } });
function TextField({ label, value, change, multiline = false, max = 2000 }: { label: string; value: string; change: (value: string) => void; multiline?: boolean; max?: number }) {
  return <label className="block text-xs font-semibold">{label}{multiline ? <textarea className={`${field} leading-7`} rows={4} value={value} maxLength={max} onChange={event => change(event.target.value)} /> : <input className={field} value={value} maxLength={max} onChange={event => change(event.target.value)} />}</label>;
}
function LinksEditor({ links, change }: { links: PortfolioLink[]; change: (links: PortfolioLink[]) => void }) {
  return <div className="space-y-3">{links.map((link, index) => <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_2fr_auto]">
    <TextField label="링크 이름" value={link.label} max={50} change={label => change(links.map((item, i) => i === index ? { ...item, label } : item))} />
    <TextField label="링크 주소 (https)" value={link.url} change={url => change(links.map((item, i) => i === index ? { ...item, url } : item))} />
    <Button variant="ghost" onClick={() => change(links.filter((_, i) => i !== index))}>제거</Button>
  </div>)}<Button variant="secondary" disabled={links.length >= 5} onClick={() => change([...links, { label: '', url: '' }])}>링크 추가</Button></div>;
}
async function readResponse(response: Response): Promise<PublicPortfolio | null> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '공개 포트폴리오를 처리하지 못했습니다.');
  return body;
}
export function PublicPortfolioEditor() {
  const [saved, setSaved] = useState<PublicPortfolio>(blank);
  const [draft, setDraft] = useState<PublicPortfolio>(blank);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const blocked = useRef(false);
  blocked.current = dirty || saving;
  useEffect(() => {
    const abort = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || blocked.current || document.hidden) return;
      pending = true;
      try {
        const data = await fetch('/api/portfolio/public', { cache: 'no-store', signal: abort.signal }).then(readResponse);
        if (!abort.signal.aborted && !blocked.current) { const value = data ?? blank(); setSaved(value); setDraft(structuredClone(value)); setReady(true); }
      } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : '불러오지 못했습니다.'); }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link && link.getAttribute('target') !== '_blank' && !link.getAttribute('href')?.startsWith('#') && !window.confirm('저장하지 않은 내용이 있습니다. 이동할까요?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const content = draft.content;
  const change = (patch: Partial<PublicPortfolioContent>) => { setDraft({ ...draft, content: { ...content, ...patch } }); setNotice(''); };
  async function save() {
    setSaving(true); setError(''); setNotice('');
    try {
      const data = await fetch('/api/portfolio/public', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portfolio: draft, expectedRevision: draft.revision }) }).then(readResponse);
      if (!data) throw new Error('저장 결과를 확인하지 못했습니다.');
      setSaved(data); setDraft(structuredClone(data)); setNotice(data.published ? '저장했습니다. 공개 링크에 반영됐습니다.' : '저장했습니다. 공개 링크는 비공개 상태입니다.');
    } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다. 작성 내용은 유지됩니다.'); }
    finally { setSaving(false); }
  }
  async function reload() {
    if (dirty && !window.confirm('작성 중인 내용을 버리고 최신 정보를 불러올까요?')) return;
    setSaving(true); setError('');
    try { const data = await fetch('/api/portfolio/public', { cache: 'no-store' }).then(readResponse); const value = data ?? blank(); setSaved(value); setDraft(structuredClone(value)); setReady(true); }
    catch (error) { setError(error instanceof Error ? error.message : '불러오지 못했습니다.'); }
    finally { setSaving(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL('/portfolio/show', window.location.origin).href); setNotice('공개 링크를 복사했습니다.'); }
    catch { setError('링크를 복사하지 못했습니다. /portfolio/show 주소를 복사해 주세요.'); }
  }
  async function copyDraft() {
    const text = [content.name, content.headline, ...content.introduction, ...content.strengths.map(item => `${item.title}\n${item.body}`), ...content.skills.map(item => `${item.title}\n${item.items.join(', ')}`), ...content.projects.map(item => [item.title, item.description, item.role, ...item.highlights, item.stack.join(', '), ...item.links.map(link => link.url)].join('\n')), ...content.activities.map(item => `${item.title} ${item.period}\n${item.detail}`), ...content.links.map(link => link.url)].join('\n\n');
    try { await navigator.clipboard.writeText(text); setNotice('작성 중인 내용을 복사했습니다.'); }
    catch { setError('복사하지 못했습니다. 입력한 내용을 직접 선택해 복사해 주세요.'); }
  }
  return <div className="space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4">
      <div><p className="text-sm font-semibold">{saved.published ? '공개 중' : '비공개'} · /portfolio/show</p><p className="mt-1 text-xs text-[var(--bi-muted)]">여기에 저장한 내용만 로그인 없이 공유됩니다. 기존 이력서와 지원용 정보는 별도로 유지됩니다.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={copyLink}>링크 복사</Button><a href="/portfolio/show" target="_blank" rel="noopener noreferrer" className="rounded border border-[var(--bi-border)] px-3 py-2 text-xs">공개 화면 열기 ↗</a></div>
    </div>
    {error && <p role="alert" className="rounded border border-[var(--bi-error)] p-3 text-sm text-[var(--bi-error)]">{error}</p>}
    <p role="status" className="text-xs text-[var(--bi-muted)]">{notice}</p>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--bi-muted)]">{dirty ? '저장하지 않은 변경 내용이 있습니다.' : saved.updatedAt ? `마지막 저장: ${new Date(saved.updatedAt).toLocaleString('ko-KR')}` : '공개용 내용을 작성해 주세요.'}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={saving} onClick={reload}>다시 불러오기</Button><Button variant="secondary" disabled={!ready} onClick={copyDraft}>내용 복사</Button><Button variant="secondary" disabled={!ready} onClick={() => setPreview(!preview)}>{preview ? '편집으로 돌아가기' : '미리보기'}</Button><Button loading={saving} disabled={!ready || !dirty} onClick={save}>저장</Button></div></div>
    {!ready ? <p className="py-12 text-center text-sm">공개 포트폴리오를 불러오는 중입니다.</p> : <>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.published} disabled={saving} onChange={event => setDraft({ ...draft, published: event.target.checked })} />로그인 없이 공개하기 <span className="text-xs text-[var(--bi-muted)]">저장하면 적용됩니다.</span></label>
      {preview ? <div className="overflow-hidden rounded border border-[var(--bi-border)]"><PublicPortfolioView content={content} /></div> : <fieldset disabled={saving} className="space-y-8 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4 md:p-6">
        <section className="space-y-4"><h2 className="text-base font-bold">소개</h2><TextField label="이름" value={content.name} max={100} change={name => change({ name })} /><TextField label="한 줄 소개" value={content.headline} max={200} change={headline => change({ headline })} /><TextField label="소개 (한 줄에 한 문단)" value={content.introduction.join('\n')} multiline max={10000} change={value => change({ introduction: value.split('\n') })} /><LinksEditor links={content.links} change={links => change({ links })} /></section>
        <section className="space-y-4"><h2 className="text-base font-bold">핵심 역량</h2>{content.strengths.map((item, index) => <div key={index} className="space-y-3 border-t border-[var(--bi-border)] pt-4"><TextField label="역량 제목" value={item.title} max={100} change={title => change({ strengths: content.strengths.map((value, i) => i === index ? { ...value, title } : value) })} /><TextField label="역량 설명" value={item.body} multiline change={body => change({ strengths: content.strengths.map((value, i) => i === index ? { ...value, body } : value) })} /><Button variant="ghost" onClick={() => change({ strengths: content.strengths.filter((_, i) => i !== index) })}>역량 제거</Button></div>)}<Button variant="secondary" disabled={content.strengths.length >= 6} onClick={() => change({ strengths: [...content.strengths, { title: '', body: '' }] })}>역량 추가</Button></section>
        <section className="space-y-4"><h2 className="text-base font-bold">기술 스택</h2>{content.skills.map((item, index) => <div key={index} className="space-y-3 border-t border-[var(--bi-border)] pt-4"><TextField label="기술 분야" value={item.title} max={100} change={title => change({ skills: content.skills.map((value, i) => i === index ? { ...value, title } : value) })} /><TextField label="기술 이름 (쉼표로 구분)" value={item.items.join(',')} change={value => change({ skills: content.skills.map((item, i) => i === index ? { ...item, items: value.split(',') } : item) })} /><Button variant="ghost" onClick={() => change({ skills: content.skills.filter((_, i) => i !== index) })}>분야 제거</Button></div>)}<Button variant="secondary" disabled={content.skills.length >= 6} onClick={() => change({ skills: [...content.skills, { title: '', items: [] }] })}>분야 추가</Button></section>
        <section className="space-y-4"><h2 className="text-base font-bold">프로젝트</h2>{content.projects.map((item, index) => {
          const update = (patch: Partial<typeof item>) => change({ projects: content.projects.map((value, i) => i === index ? { ...value, ...patch } : value) });
          return <div key={item.id} className="space-y-3 border-t border-[var(--bi-border)] pt-5"><h3 className="text-sm font-semibold">{index + 1}. {item.title || '새 프로젝트'}</h3><TextField label="프로젝트 이름" value={item.title} max={150} change={title => update({ title })} /><TextField label="구분 (개인·팀, 담당 분야 등)" value={item.category} max={100} change={category => update({ category })} /><TextField label="프로젝트 소개" value={item.description} multiline change={description => update({ description })} /><TextField label="담당 역할" value={item.role} max={300} change={role => update({ role })} /><TextField label="주요 작업 (한 줄에 하나)" value={item.highlights.join('\n')} multiline max={20000} change={value => update({ highlights: value.split('\n') })} /><TextField label="사용 기술 (쉼표로 구분)" value={item.stack.join(',')} change={value => update({ stack: value.split(',') })} /><LinksEditor links={item.links} change={links => update({ links })} /><div className="flex gap-2"><Button variant="secondary" disabled={index === 0} onClick={() => { const projects = [...content.projects]; [projects[index - 1], projects[index]] = [projects[index], projects[index - 1]]; change({ projects }); }}>위로 이동</Button><Button variant="secondary" disabled={index === content.projects.length - 1} onClick={() => { const projects = [...content.projects]; [projects[index + 1], projects[index]] = [projects[index], projects[index + 1]]; change({ projects }); }}>아래로 이동</Button><Button variant="ghost" onClick={() => { if (window.confirm('이 프로젝트를 공개용 본문에서 제거할까요? 저장 전까지는 다시 불러오기로 되돌릴 수 있습니다.')) change({ projects: content.projects.filter((_, i) => i !== index) }); }}>프로젝트 제거</Button></div></div>;
        })}<Button variant="secondary" disabled={content.projects.length >= 20} onClick={() => change({ projects: [...content.projects, { id: crypto.randomUUID(), title: '', category: '', description: '', role: '', highlights: [''], stack: [], links: [] }] })}>프로젝트 추가</Button></section>
        <section className="space-y-4"><h2 className="text-base font-bold">교육과 활동</h2>{content.activities.map((item, index) => <div key={index} className="space-y-3 border-t border-[var(--bi-border)] pt-4"><TextField label="활동 제목" value={item.title} max={150} change={title => change({ activities: content.activities.map((value, i) => i === index ? { ...value, title } : value) })} /><TextField label="기간 (선택)" value={item.period} max={100} change={period => change({ activities: content.activities.map((value, i) => i === index ? { ...value, period } : value) })} /><TextField label="설명" value={item.detail} multiline change={detail => change({ activities: content.activities.map((value, i) => i === index ? { ...value, detail } : value) })} /><Button variant="ghost" onClick={() => change({ activities: content.activities.filter((_, i) => i !== index) })}>활동 제거</Button></div>)}<Button variant="secondary" disabled={content.activities.length >= 15} onClick={() => change({ activities: [...content.activities, { title: '', detail: '', period: '' }] })}>활동 추가</Button></section>
      </fieldset>}
    </>}
  </div>;
}
