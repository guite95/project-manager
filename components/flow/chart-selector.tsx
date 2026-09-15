"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/erp/badge';
import { Dropdown } from '@/components/erp/dropdown';
import { contentLabels, type ProjectContent } from '@/lib/flows/content';
import type { FlowChart } from './types';
import { chartHref } from '@/lib/flows/registry';

type ChartOption = Pick<FlowChart, 'slug' | 'title' | 'description' | 'erdDomain'> & { contentKind?: ProjectContent['kind'] };
const kindLabel = (chart: ChartOption) => chart.erdDomain ? 'ERD' : chart.contentKind ? contentLabels[chart.contentKind] : '차트';

export function ChartSelector({ projectSlug, projectTitle, categorySlug, categoryTitle, charts, selectedSlug }: {
  projectSlug: string; projectTitle: string; categorySlug: string; categoryTitle: string; charts: ChartOption[]; selectedSlug: string;
}) {
  const router = useRouter();
  const selected = charts.find(chart => chart.slug === selectedSlug) ?? charts[0];
  if (!selected) return null;
  return <div className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] px-4 py-2 md:px-6">
    <nav aria-label="위치" className="min-w-0 text-[11px] text-[var(--bi-muted)]">
      <Link href="/flows" className="hover:text-[var(--bi-fg)]">{projectTitle}</Link>
      <span aria-hidden className="mx-1.5">/</span><span>{categoryTitle}</span>
    </nav>
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-[32rem] sm:max-w-full">
      <Badge variant="primary">{kindLabel(selected)}</Badge>
      <Dropdown className="min-w-0 flex-1" ariaLabel="차트 선택" searchable searchPlaceholder="차트 제목·설명 검색"
        value={selected.slug} options={charts.map(chart => ({ value: chart.slug, label: chart.title, description: chart.description }))}
        onChange={slug => router.push(chartHref(projectSlug, categorySlug, slug))} />
      <span className="shrink-0 text-[11px] tabular-nums text-[var(--bi-muted)]">{charts.indexOf(selected) + 1} / {charts.length}</span>
    </div>
  </div>;
}
