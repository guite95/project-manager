import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import { AccessManager } from "@/components/access/access-manager";
import { ProjectManager } from "@/components/projects/project-manager";
import Link from "next/link";

export const metadata: Metadata = { title: "설정 — 프로젝트 매니지먼트" };
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const active = (await searchParams).tab === 'projects' ? 'projects' : 'access';
  return <div className="mx-auto max-w-[1200px]">
    <PageHeader title="설정" description="계정·권한과 프로젝트의 할 일 표시 여부를 관리합니다." />
    <div className="px-6 py-6">
      <nav aria-label="설정 메뉴" className="mb-6 flex gap-5 border-b border-[var(--bi-border)]">
        {[{ id: 'access', title: '계정·권한' }, { id: 'projects', title: '프로젝트 관리' }].map(tab => <Link key={tab.id} href={`/settings?tab=${tab.id}`} aria-current={active === tab.id ? 'page' : undefined} className={`border-b-2 px-1 pb-3 text-sm ${active === tab.id ? 'border-[var(--bi-accent)] font-semibold text-[var(--bi-fg)]' : 'border-transparent text-[var(--bi-muted)]'}`}>{tab.title}</Link>)}
      </nav>
      {active === 'projects' ? <ProjectManager /> : <AccessManager />}
    </div>
  </div>;
}
