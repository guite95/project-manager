"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HiChevronRight } from "react-icons/hi";
import { flowCategories } from "@/lib/flows/registry";

const STORAGE_KEY = "flows-sidebar-collapsed-v1";

export function AppSidebar() {
  const pathname = usePathname();
  const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setUserOverrides(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (title: string, currentlyCollapsed: boolean) => {
    setUserOverrides((prev) => {
      const next = { ...prev, [title]: !currentlyCollapsed };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* quota 에러 무시 */
      }
      return next;
    });
  };

  return (
    <nav className="flex h-full flex-col gap-2 overflow-y-auto py-3">
      <Link
        href="/flows"
        className={`mx-2 flex h-8 items-center gap-2 rounded-[3px] px-2 text-[12px] transition ${
          pathname === "/flows"
            ? "bg-[var(--bi-sidebar-active)] font-semibold text-[var(--bi-fg)]"
            : "text-[var(--bi-fg)] hover:bg-[var(--bi-sidebar-active)]"
        }`}
      >
        전체 플로우차트
      </Link>
      <Link
        href="/guide"
        className={`mx-2 -mt-1 flex h-8 items-center gap-2 rounded-[3px] px-2 text-[12px] transition ${
          pathname === "/guide"
            ? "bg-[var(--bi-sidebar-active)] font-semibold text-[var(--bi-fg)]"
            : "text-[var(--bi-fg)] hover:bg-[var(--bi-sidebar-active)]"
        }`}
      >
        작성 가이드
      </Link>

      {flowCategories.map((category) => {
        const hasActive = category.charts.some(
          (c) => pathname === `/flows/${c.slug}`
        );
        // 사용자가 명시적으로 토글한 적 있으면 그 값을 따르고, 없으면 활성 카테고리는 펼침.
        const isCollapsed =
          category.title in userOverrides
            ? userOverrides[category.title] === true
            : !hasActive;
        const sectionId = `flow-cat-${category.title}`;

        return (
          <div key={category.title}>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              aria-controls={sectionId}
              onClick={() => toggle(category.title, isCollapsed)}
              className="flex w-full items-center gap-1.5 px-4 pt-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-[var(--bi-muted)] uppercase transition hover:text-[var(--bi-fg)]"
            >
              <HiChevronRight
                size={10}
                className={`shrink-0 transition-transform ${
                  isCollapsed ? "rotate-0" : "rotate-90"
                }`}
              />
              <span className="truncate">{category.title}</span>
            </button>

            {!isCollapsed ? (
              <div id={sectionId}>
                {category.charts.map((chart) => {
                  const href = `/flows/${chart.slug}`;
                  const active = pathname === href;
                  return (
                    <Link
                      key={chart.slug}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`mx-2 flex h-8 items-center gap-2 rounded-[3px] px-2 text-[12px] transition ${
                        active
                          ? "bg-[var(--bi-sidebar-active)] font-semibold text-[var(--bi-fg)]"
                          : "text-[var(--bi-fg)] hover:bg-[var(--bi-sidebar-active)]"
                      }`}
                    >
                      <span className="truncate">{chart.title}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
