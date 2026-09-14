import { Suspense, type ReactNode } from "react";
import { listFlowProjects } from "@/lib/server/flows-store";
import { loadSidebarOrder } from "@/lib/server/sidebar-store";
import { loadUiPreferences } from "@/lib/server/ui-preferences-store";
import { WorkspaceShell } from "./workspace-shell";

export const APP_BRAND = "프로젝트 매니지먼트";

export async function AppShell({ children }: { children: ReactNode }) {
  const flowProjects = await listFlowProjects();
  const [projectOrder, preferences] = await Promise.all([
    loadSidebarOrder(flowProjects.map(project => project.slug)),
    loadUiPreferences("navigation"),
  ]);
  return (
    <Suspense>
      <WorkspaceShell brand={APP_BRAND} flowProjects={flowProjects} initialProjectOrder={projectOrder} initialPreferences={preferences}>
        {children}
      </WorkspaceShell>
    </Suspense>
  );
}
