import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { HiOutlineShare } from "react-icons/hi";
import { AppSidebar } from "./app-sidebar";

export const APP_BRAND = "프로젝트 매니지먼트";

export function AppShell({ children }: { children: ReactNode }) {
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
            <AppSidebar />
          </Suspense>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
