"use client";

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/erp/button';
import { materialsHref } from '@/lib/materials';

export function MaterialDeleteButton({ project, slug, title, returnToList = false }: {
  project: string; slug: string; title: string; returnToList?: boolean;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState('');
  async function remove() {
    if (submitting.current || refreshing || !window.confirm(`“${title}” 자료를 삭제할까요? 삭제한 자료는 복구할 수 없습니다.`)) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/flows/${encodeURIComponent(project)}/materials/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? '자료를 삭제하지 못했습니다. 다시 시도해 주세요.');
      }
      startTransition(() => {
        if (returnToList) router.replace(materialsHref(project));
        router.refresh();
      });
    } catch (error) { setError(error instanceof Error ? error.message : '자료를 삭제하지 못했습니다.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div>
    <Button size="sm" variant="destructive" loading={busy || refreshing} aria-label={`${title} 자료 삭제`} onClick={remove}>삭제</Button>
    {error ? <p role="alert" className="mt-1 text-[12px] text-[var(--bi-error)]">{error}</p> : null}
  </div>;
}
