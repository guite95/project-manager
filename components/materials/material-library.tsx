"use client";

import { useAccess } from "@/components/access/context";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/erp/button';
import { Badge } from '@/components/erp/badge';
import { DataTable } from '@/components/erp/data-table';
import { TextField } from '@/components/erp/form-field';
import { FormGrid } from '@/components/erp/form-layout';
import { hangulIncludes } from '@/components/erp/hangul-match';
import { MaterialSelector, materialFormatLabel } from './material-selector';
import { MaterialDeleteButton } from './material-delete-button';
import { useRef, useState, type FormEvent } from 'react';
import { materialsHref, MAX_MATERIAL_BYTES, type MaterialSummary } from '@/lib/materials';

const inputClass = 'min-h-10 w-full rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 text-[13px]';

export function MaterialLibrary({ project, projectTitle, materials }: { project: string; projectTitle: string; materials: MaterialSummary[] }) {
  const { canWrite, canDelete } = useAccess();
  const writable = canWrite(project);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [adding, setAdding] = useState(!materials.length || searchParams.get('add') === '1');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const visible = materials.filter(m => hangulIncludes(`${m.title} ${m.fileName ?? ''} ${m.format} ${m.description ?? ''}`, query));
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!writable || submitting.current || !selected) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('file', selected); form.set('title', title.trim());
      const response = await fetch(`/api/flows/${encodeURIComponent(project)}/materials`, { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? (response.status === 413 ? '파일 용량이 서버의 업로드 한도를 초과했습니다.' : '자료를 추가하지 못했습니다. 다시 시도해 주세요.'));
      router.push(materialsHref(project, body.slug)); router.refresh();
    } catch (error) { setError((error as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <>
    <MaterialSelector project={project} projectTitle={projectTitle} materials={materials} onAdd={() => setAdding(true)} />
    <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-6">
    {writable && adding ? <form onSubmit={upload} className="mb-7 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4 md:p-5">
      <h2 className="mb-1 text-[15px] font-semibold">자료 추가</h2>
      <p id="material-file-help" className="mb-4 text-[12px] text-[var(--bi-muted)]">PDF·HTML·PPTX 파일을 추가하면 형식에 맞게 미리보기를 제공합니다. PPTX는 PDF 미리보기도 함께 생성합니다. 파일당 최대 10MB, HTML은 UTF-8 형식입니다.</p>
      <FormGrid>
        <label className="space-y-2 text-[12px]">파일 선택
          <input ref={fileInput} type="file" accept=".pdf,.html,.htm,.pptx,application/pdf,text/html,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={busy} required aria-describedby="material-file-help" className={`${inputClass} block py-2`} onChange={event => {
            const file = event.target.files?.[0] ?? null;
            setError('');
            if (file && (!/\.(pdf|html?|pptx)$/i.test(file.name) || !file.size || file.size > MAX_MATERIAL_BYTES)) {
              setError('비어 있지 않은 PDF, HTML 또는 PPTX 파일(최대 10MB)을 선택해 주세요.'); setSelected(null); event.target.value = ''; return;
            }
            setSelected(file); if (file) setTitle(file.name.replace(/\.(pdf|html?|pptx)$/i, '').slice(0, 200));
          }} />
        </label>
        <TextField label="자료 제목" value={title} onChange={value => setTitle(value.slice(0, 200))} required disabled={busy} placeholder="자료 제목을 입력하세요" />
      </FormGrid>
      {error ? <p role="alert" className="mt-3 text-[13px] text-[var(--bi-error)]">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => { setAdding(false); setSelected(null); setTitle(''); setError(''); }}>취소</Button>
        <Button type="submit" loading={busy} disabled={!selected || !title.trim()}>자료 추가</Button>
      </div>
    </form> : null}
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <h1 className="flex-1 text-[16px] font-semibold">자료 목록 <span className="text-[var(--bi-muted)]">{materials.length}</span></h1>
      <div className="w-full sm:w-[300px]"><TextField type="search" label="자료 검색" placeholder="제목·파일명·형식 검색" value={query} onChange={setQuery} /></div>
    </div>
    <div className="overflow-x-auto rounded border border-[var(--bi-border)]">
      <DataTable caption="프로젝트 자료 목록" rows={visible} rowKey={row => row.slug}
        emptyMessage={materials.length ? '검색 결과가 없습니다.' : writable ? '아직 등록된 자료가 없습니다. 자료 추가에서 PDF, HTML 또는 PPTX 파일을 선택해 주세요.' : '아직 등록된 자료가 없습니다.'}
        columns={[
          { key: 'format', header: '형식', render: row => <Badge variant="primary">{materialFormatLabel(row.format)}</Badge> },
          { key: 'title', header: '자료', render: row => <Link href={materialsHref(project, row.slug)} className="font-semibold text-[var(--bi-accent)] hover:underline">{row.title}</Link> },
          { key: 'file', header: '파일명', render: row => row.fileName ?? '가져온 자료' },
          { key: 'updated', header: '등록·수정일', render: row => row.updatedAt.slice(0, 10) },
          ...(canDelete(project) ? [{ key: 'actions', header: '관리', render: (row: MaterialSummary) => <MaterialDeleteButton project={project} slug={row.slug} title={row.title} /> }] : []),
        ]} />
    </div>
    </div>
  </>;
}
