'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccess } from '@/components/access/context';
import { Button } from '@/components/erp/button';
import { Dropdown } from '@/components/erp/dropdown';
import { ProjectEditor } from './project-editor';
import type { ManagedProject } from '@/lib/project-registry';

export function ProjectManager() {
  const { role } = useAccess();
  const [projects, setProjects] = useState<ManagedProject[]>([]);
  const [ready, setReady] = useState(false);
  const [scope, setScope] = useState('ALL');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const saving = useRef(false);
  const sequence = useRef(0);
  const refresh = () => setRefreshVersion(value => value + 1);

  useEffect(() => {
    if (role !== 'OWNER' && role !== 'ADMIN') return;
    const abort = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading || saving.current || document.hidden) return;
      loading = true;
      const request = ++sequence.current;
      try {
        const scopes = role === 'OWNER' ? ['COMPANY', 'PERSONAL'] : ['COMPANY'];
        const rows = await Promise.all(scopes.map(async scope => {
          const response = await fetch(`/api/project-registry?scope=${scope}`, { cache: 'no-store', signal: abort.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || '프로젝트 목록을 불러오지 못했습니다.');
          return data as ManagedProject[];
        }));
        if (!abort.signal.aborted && request === sequence.current) { setProjects(rows.flat()); setReady(true); setLoadError(''); }
      } catch (error) { if (!abort.signal.aborted && request === sequence.current) setLoadError(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.'); }
      finally { loading = false; }
    };
    void load();
    const timer = setInterval(load, 15_000);
    window.addEventListener('focus', load); document.addEventListener('visibilitychange', load);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, [role, refreshVersion]);

  async function toggle(project: ManagedProject, showInTasks: boolean) {
    if (saving.current) return;
    saving.current = true; sequence.current++; setPending(project.slug); setError(''); setNotice('');
    try {
      const response = await fetch('/api/project-registry', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: project.slug, revision: project.revision, showInTasks }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '표시 설정을 저장하지 못했습니다.');
      setProjects(rows => rows.map(row => row.slug === project.slug ? data as ManagedProject : row));
      setNotice(`${project.title}: 할 일 ${showInTasks ? '표시' : '숨김'} 설정을 저장했습니다.`);
    } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다.'); }
    finally { saving.current = false; setPending(null); refresh(); }
  }
  if (role !== 'OWNER' && role !== 'ADMIN') return null;
  const rows = projects.filter(project => (scope === 'ALL' || project.scope === scope) && project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section aria-label="프로젝트 관리" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-xs leading-6 text-[var(--bi-muted)]">‘할 일에 표시’를 선택한 프로젝트만 이슈 목록에 나타납니다. 해제해도 기존 이슈·오늘의 할 일·완료 기록은 보존되며, 다시 선택하면 기존 이슈를 볼 수 있습니다.</p>
      <div className="flex flex-wrap gap-2"><ProjectEditor scope="COMPANY" addLabel="회사 프로젝트 추가" onSaved={refresh} />{role === 'OWNER' && <ProjectEditor scope="PERSONAL" addLabel="개인 프로젝트 추가" onSaved={refresh} />}</div>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <input aria-label="프로젝트 이름 검색" placeholder="프로젝트 이름 검색" value={query} onChange={event => setQuery(event.target.value)} className="h-9 min-w-0 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 text-xs" />
      {role === 'OWNER' && <div className="w-32"><Dropdown ariaLabel="프로젝트 구분" value={scope} onChange={setScope} options={[{ value: 'ALL', label: '전체' }, { value: 'COMPANY', label: '회사' }, { value: 'PERSONAL', label: '개인' }]} /></div>}
      <Button variant="secondary" disabled={pending !== null} onClick={refresh}>다시 불러오기</Button>
    </div>
    {error || loadError ? <p role="alert" className="text-sm text-[var(--bi-error)]">{error || loadError}</p> : null}
    <p role="status" className="text-xs text-[var(--bi-muted)]">{pending ? '표시 설정을 저장하는 중입니다.' : notice}</p>
    <div className="overflow-x-auto rounded border border-[var(--bi-border)]">
      <table className="w-full min-w-[580px] border-collapse text-left text-xs">
        <thead className="bg-[var(--bi-bg)] text-[var(--bi-muted)]"><tr>{['프로젝트', '구분', '개인 분류', '할 일에 표시', '관리'].map(title => <th scope="col" key={title} className="border-b border-[var(--bi-border)] px-4 py-3 font-medium">{title}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--bi-border)] bg-[var(--bi-card-bg)]">
          {!ready || !rows.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--bi-muted)]">{!ready ? loadError ? '목록을 다시 불러와 주세요.' : '프로젝트를 불러오는 중입니다.' : '표시할 프로젝트가 없습니다.'}</td></tr> : rows.map(project => <tr key={project.slug}>
            <th scope="row" className="px-4 py-3 font-medium">{project.title}</th>
            <td className="px-4 py-3">{project.scope === 'PERSONAL' ? '개인' : '회사'}</td>
            <td className="px-4 py-3">{project.scope !== 'PERSONAL' ? '—' : project.personalGroup === 'PORTFOLIO' ? '포폴용' : '토이'}</td>
            <td className="px-4 py-3"><label className="inline-flex min-h-9 cursor-pointer items-center gap-2"><input type="checkbox" aria-label={`${project.title} 할 일에 표시`} checked={project.showInTasks} disabled={pending !== null} onChange={event => void toggle(project, event.target.checked)} className="h-4 w-4 accent-[var(--bi-accent)]" /><span>{project.showInTasks ? '표시' : '숨김'}</span></label></td>
            <td className="px-4 py-3"><ProjectEditor scope={project.scope} slug={project.slug} onSaved={refresh} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
