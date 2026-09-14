import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { HiOutlineShare } from "react-icons/hi";
import type { FlowProject } from "@/components/flow/types";
import { listFlowProjects } from "@/lib/server/flows-store";
import { loadSidebarOrder } from "@/lib/server/sidebar-store";
import { AppSidebar } from "./app-sidebar";

export const APP_BRAND = "프로젝트 매니지먼트";

async function Sidebar({ flowProjects }: { flowProjects: FlowProject[] }) {
  const projectOrder = await loadSidebarOrder(flowProjects.map((project) => project.slug));
  return <AppSidebar flowProjects={flowProjects} initialProjectOrder={projectOrder} />;
}

export async function AppShell({ children }: { children: ReactNode }) {
  const flowProjects = await listFlowProjects();
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bi-bg)]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-4">
        <Link
          href="/flows"
          className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-[var(--bi-fg)]"
        >
          <HiOutlineShare size={16} />
          <span>{APP_BRAND}</span>
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[240px] shrink-0 border-r border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)]">
          <Suspense fallback={null}>
            <Sidebar flowProjects={flowProjects} />
          </Suspense>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
