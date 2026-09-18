import { Suspense, type ReactNode } from "react";
import { toFlowNavigation } from "@/lib/server/flow-catalog-store";
import { loadSidebarOrder } from "@/lib/server/sidebar-store";
import { loadUiPreferences } from "@/lib/server/ui-preferences-store";
import { WorkspaceShell } from "./workspace-shell";
import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/access/http';
import { accessibleCatalog } from '@/lib/access/catalog';
import { AccessProvider } from '@/components/access/context';
import { scopePersonalProjectGroups } from '@/lib/navigation/workspace-menu';

export const APP_BRAND = "프로젝트 매니지먼트";

export async function AppShell({ children }: { children: ReactNode }) {
  const actor=await currentActor();
  if(!actor) redirect('/login');
  const flowProjects = toFlowNavigation(await accessibleCatalog());
  const [projectOrder, preferences, personalProjectGroups] = await Promise.all([
    loadSidebarOrder(flowProjects.map(project => project.slug)),
    loadUiPreferences("navigation"),
    loadUiPreferences("personal-project-groups"),
  ]);
  return (
    <AccessProvider actor={actor}><Suspense>
      <WorkspaceShell
        brand={APP_BRAND}
        flowProjects={flowProjects}
        initialProjectOrder={projectOrder}
        initialPreferences={preferences}
        initialPersonalProjectGroups={scopePersonalProjectGroups(personalProjectGroups, flowProjects)}
        account={{ name: actor.name ?? "", username: actor.username ?? "", role: actor.role }}
      >
        {children}
      </WorkspaceShell>
    </Suspense></AccessProvider>
  );
}
