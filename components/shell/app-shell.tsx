import { Suspense, type ReactNode } from "react";
import { toFlowNavigation } from "@/lib/server/flow-catalog-store";
import { loadSidebarOrder } from "@/lib/server/sidebar-store";
import { loadUiPreferences } from "@/lib/server/ui-preferences-store";
import { WorkspaceShell } from "./workspace-shell";
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentActor } from '@/lib/access/http';
import { accessibleCatalog } from '@/lib/access/catalog';
import { AccessProvider } from '@/components/access/context';
import { MemberShell } from '@/components/access/member-shell';
import { LogoutButton } from '@/components/access/logout-button';

export const APP_BRAND = "프로젝트 매니지먼트";

export async function AppShell({ children }: { children: ReactNode }) {
  const actor=await currentActor();
  if(!actor) redirect('/login');
  const flowProjects = toFlowNavigation(await accessibleCatalog());
  if(actor.role!=='OWNER') return <AccessProvider actor={actor}><MemberShell projects={flowProjects} admin={actor.role==='ADMIN'} name={actor.name??''}>{children}</MemberShell></AccessProvider>;
  const [projectOrder, preferences] = await Promise.all([
    loadSidebarOrder(flowProjects.map(project => project.slug)),
    loadUiPreferences("navigation"),
  ]);
  return (
    <AccessProvider actor={actor}><Suspense>
      <WorkspaceShell brand={APP_BRAND} flowProjects={flowProjects} initialProjectOrder={projectOrder} initialPreferences={preferences}>
        <div className="flex justify-end gap-4 border-b border-[var(--bi-border)] px-5 py-2 text-xs"><Link href="/account">내 계정</Link><Link href="/settings">{actor.bootstrap?'소유자 계정 등록':'계정·공유 관리'}</Link><LogoutButton /></div>
        {children}
      </WorkspaceShell>
    </Suspense></AccessProvider>
  );
}
