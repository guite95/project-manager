"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/erp/badge';
import { Button } from '@/components/erp/button';
import { Dropdown } from '@/components/erp/dropdown';
import { materialsHref, type MaterialSummary } from '@/lib/materials';

export const materialFormatLabel = (format: string) => format === 'slides' ? '발표' : format.toUpperCase();

export function MaterialSelector({ project, projectTitle, materials, selectedSlug = '', onAdd }: {
  project: string; projectTitle: string; materials: MaterialSummary[]; selectedSlug?: string; onAdd?: () => void;
}) {
  const router = useRouter();
  const index = materials.findIndex(item => item.slug === selectedSlug);
  const selected = materials[index];
  return <div className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] px-4 py-2 md:px-6">
    <nav aria-label="자료 위치" className="text-[11px] text-[var(--bi-muted)]">
      <Link href="/flows" className="hover:text-[var(--bi-fg)]">{projectTitle}</Link>
      <span aria-hidden className="mx-1.5">/</span>
      <Link href={materialsHref(project)} className="hover:text-[var(--bi-fg)]">자료</Link>
    </nav>
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[40rem]">
      {selected ? <Badge variant="primary">{materialFormatLabel(selected.format)}</Badge> : null}
      <Dropdown className="min-w-0 flex-1" ariaLabel="자료 선택" searchable disabled={!materials.length}
        searchPlaceholder="자료 제목·파일명 검색" value={selectedSlug}
        options={materials.map(item => ({ value: item.slug, label: item.title,
          description: [materialFormatLabel(item.format), item.fileName ?? item.description].filter(Boolean).join(' · ') }))}
        onChange={slug => router.push(materialsHref(project, slug))} />
      <span className="shrink-0 text-[11px] tabular-nums text-[var(--bi-muted)]">{selected ? `${index + 1} / ${materials.length}` : `${materials.length}개`}</span>
    </div>
    <Button size="sm" variant="secondary" onClick={onAdd ?? (() => router.push(`${materialsHref(project)}?add=1`))}>자료 추가</Button>
  </div>;
}
