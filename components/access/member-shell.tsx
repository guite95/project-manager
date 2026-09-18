'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { FlowNavigationProject } from '@/lib/navigation/flow-navigation';
import { chartHref } from '@/lib/flows/registry';
import { hasProjectNotes } from '@/lib/project-notes';
import { LogoutButton } from './logout-button';
export function MemberShell({projects,admin,name,children}:{projects:FlowNavigationProject[];admin:boolean;name:string;children:ReactNode}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  return <div className="min-h-screen bg-[var(--bi-bg)] text-[var(--bi-fg)]">
    <header className="flex flex-wrap items-center gap-4 border-b border-[var(--bi-border)] px-5 py-3 text-sm">
      <Link href="/flows" className="font-bold">프로젝트 매니지먼트</Link><span className="flex-1" />
      <span>{name}</span><Link href="/account">내 계정</Link>{admin&&<Link href="/settings">계정·공유 관리</Link>}
      <LogoutButton />
    </header>
    <div className="md:flex"><aside className="border-b border-[var(--bi-border)] p-3 md:w-64 md:shrink-0 md:border-r">
      <Link className="block px-3 py-2 text-sm" href="/flows">전체 프로젝트</Link>
      {!projects.length&&<p className="p-3 text-xs text-[var(--bi-muted)]">아직 접근 가능한 프로젝트가 없습니다. 관리자에게 권한을 요청하세요.</p>}
      {projects.map(project=><section key={project.slug}>
        <button className="w-full rounded px-3 py-2 text-left text-sm font-semibold" aria-expanded={expanded===project.slug} onClick={()=>setExpanded(expanded===project.slug?null:project.slug)}>{expanded===project.slug?'▾':'▸'} {project.title}</button>
        {expanded===project.slug&&<nav aria-label={project.title} className="space-y-2 px-5 pb-3 text-xs">
          {hasProjectNotes(project.slug)&&<Link className="block" href={`/flows/${project.slug}/notes`}>명심할 점</Link>}
          {project.slug!=='common'&&<><Link className="block" href={`/flows/${project.slug}/meetings`}>회의록</Link><Link className="block" href={`/flows/${project.slug}/materials`}>자료</Link></>}
          {project.categories.map(category=><div key={category.slug}><p className="mt-3 mb-2 text-[var(--bi-muted)]">{category.title}</p>{category.charts.map(chart=><Link className="block py-1" key={chart.slug} href={chartHref(project.slug,category.slug,chart.slug)}>{chart.title}</Link>)}</div>)}
        </nav>}
      </section>)}
    </aside><main className="min-w-0 flex-1">{children}</main></div>
  </div>;
}
