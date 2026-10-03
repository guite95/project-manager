"use client";

import { TextInput } from '@/components/erp/form-field';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/erp/button';
import { Checkbox } from '@/components/erp/checkbox';
import { Dropdown } from '@/components/erp/dropdown';
import { FormModal } from '@/components/erp/zespro';
import { useAccess } from '@/components/access/context';
import type { ManagedProject, ProjectScope, RepositoryLink } from '@/lib/project-registry';

const field = 'mt-1';
export function ProjectEditor({ scope, slug, onSaved, addLabel = '프로젝트 추가' }: { scope: ProjectScope; slug?: string; onSaved?: () => void; addLabel?: string }) {
  const { role } = useAccess();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [revision, setRevision] = useState(0);
  const [group, setGroup] = useState('PORTFOLIO');
  const [showInTasks, setShowInTasks] = useState(true);
  const [repositories, setRepositories] = useState<RepositoryLink[]>([]);
  const allowed = role === 'OWNER' || role === 'ADMIN' && scope === 'COMPANY';

  if (!allowed) return null;
  const close = () => { if (!saving) setOpen(false); };
  const edit = async () => {
    setLoading(true); setError('');
    try {
      if (slug) {
        const response = await fetch(`/api/project-registry?scope=${scope}`, {cache:'no-store'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? '프로젝트를 불러오지 못했습니다.');
        const project = (data as ManagedProject[]).find(item => item.slug === slug);
        if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');
        setTitle(project.title); setRevision(project.revision); setRepositories(project.repositories); setGroup(project.personalGroup ?? 'PORTFOLIO');
        setShowInTasks(project.showInTasks);
      } else { setTitle(''); setRepositories([]); setGroup('PORTFOLIO'); setShowInTasks(true); }
      setOpen(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '프로젝트를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const response = await fetch('/api/project-registry', {
        method: slug ? 'PATCH' : 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({slug,revision,title,scope,personalGroup:scope === 'PERSONAL' ? group : null,repositories,showInTasks}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? '프로젝트를 저장하지 못했습니다.');
      setOpen(false); onSaved?.(); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '프로젝트를 저장하지 못했습니다.'); }
    finally { setSaving(false); }
  };
  return <>
    <Button variant={slug ? 'secondary' : 'primary'} size="sm" loading={loading} onClick={() => void edit()}>{slug ? '프로젝트 수정' : addLabel}</Button>
    {!open && error ? <p role="alert" className="text-[12px] text-[var(--bi-error)]">{error}</p> : null}
    <FormModal open={open} onClose={close} title={`${scope === 'PERSONAL' ? '개인' : '풀링'} 프로젝트 ${slug ? '수정' : '추가'}`} closeOnBackdrop={false} closeOnEscape={!saving} width="min(600px, 100%)">
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={saving} className="space-y-4">
          <label className="block text-[12px]">프로젝트 이름<TextInput autoFocus data-autofocus required maxLength={100} className={field} value={title} onChange={event => setTitle(event.target.value)} /></label>
          <div><Checkbox label="할 일에 표시" checked={showInTasks} disabled={saving} onChange={setShowInTasks} /><p className="mt-1 text-[11px] text-[var(--bi-muted)]">해제해도 기존 이슈·오늘의 할 일·완료 기록은 보존됩니다.</p></div>
          {scope === 'PERSONAL' && !slug ? <div className="space-y-1 text-[12px]"><span>분류</span><Dropdown ariaLabel="프로젝트 분류" value={group} disabled={saving} options={[{value:'PORTFOLIO',label:'포폴용 프로젝트'},{value:'TOY',label:'토이 프로젝트'}]} onChange={setGroup} /></div> : null}
          <div className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-[12px] font-semibold">연결 저장소</h3><Button variant="secondary" size="sm" disabled={repositories.length >= 50} onClick={() => setRepositories(rows => [...rows,{workspace:scope === 'PERSONAL' ? 'UK' : 'PROJECTS',path:''}])}>저장소 추가</Button></div>
            <p className="text-[11px] text-[var(--bi-muted)]">작업 폴더 아래의 저장소 경로를 입력하세요. 여러 저장소를 한 프로젝트에 연결할 수 있습니다.</p>
            {repositories.map((repo,index) => <div key={index} className="flex flex-wrap items-end gap-2">
              <div className="w-40"><Dropdown ariaLabel={`${index+1}번째 작업 폴더`} value={repo.workspace} disabled={saving} options={[{value:'UK',label:'~/uk'},{value:'PROJECTS',label:'~/Documents/project'}]} onChange={value => setRepositories(rows => rows.map((row,i) => i === index ? {...row,workspace:value as RepositoryLink['workspace']} : row))} /></div>
              <label className="min-w-40 flex-1 text-[11px]">저장소 경로<TextInput required maxLength={300} placeholder="예: conkiri/backend" className={field} value={repo.path} onChange={event => setRepositories(rows => rows.map((row,i) => i === index ? {...row,path:event.target.value} : row))} /></label>
              <Button variant="secondary" size="sm" aria-label={`${index+1}번째 저장소 연결 제거`} onClick={() => setRepositories(rows => rows.filter((_,i) => i !== index))}>제거</Button>
            </div>)}
          </div>
        </fieldset>
        {error ? <p role="alert" className="text-[12px] text-[var(--bi-error)]">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={close}>취소</Button><Button type="submit" loading={saving}>저장</Button></div>
      </form>
    </FormModal>
  </>;
}
