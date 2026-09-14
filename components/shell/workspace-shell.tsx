"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HiOutlineBookOpen, HiOutlineCalendar, HiOutlineOfficeBuilding, HiOutlineChevronDoubleLeft, HiOutlineChevronDoubleRight, HiOutlineMenu, HiOutlineX, HiChevronRight } from "react-icons/hi";
import type { FlowProject } from "@/components/flow/types";
import { useSharedPreferences } from "@/components/erp/use-shared-preferences";
import { resolveFocusTrapTarget } from "@/components/erp/focus-trap";
import { legacyNavigationPreferences, type UiPreferences } from "@/lib/ui-preferences";
import { AppSidebar } from "./app-sidebar";

const sections = [
  { id: "today", href: "/today", title: "오늘의 할 일", railTitle: "오늘의\n할 일", description: "오늘의 업무와 완료 이력", icon: HiOutlineCalendar },
  { id: "projects", href: "/flows", title: "프로젝트", railTitle: "프로젝트", description: "프로젝트 구조도와 참고 자료", icon: HiOutlineOfficeBuilding },
  { id: "guide", href: "/guide", title: "작성 가이드", railTitle: "작성\n가이드", description: "플로우차트 JSON 작성 방법", icon: HiOutlineBookOpen },
] as const;
type Section = (typeof sections)[number]["id"];
const panelLink = (active: boolean) => `mx-2 flex min-h-11 items-center rounded-[3px] px-3 text-[12px] focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)] ${active
  ? "bg-[var(--bi-accent)] font-semibold text-white"
  : "text-[var(--bi-muted)] hover:bg-[var(--bi-sidebar-active)] hover:text-[var(--bi-fg)]"}`;

export function WorkspaceShell({ brand, flowProjects, initialProjectOrder, initialPreferences, children }: {
  brand: string;
  flowProjects: FlowProject[];
  initialProjectOrder: string[];
  initialPreferences: UiPreferences;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSection: Section = pathname.startsWith("/today") ? "today" : pathname.startsWith("/guide") ? "guide" : "projects";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<Section | null>(currentSection);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const prefs = useSharedPreferences("navigation", initialPreferences, legacyNavigationPreferences);
  const collapsed = prefs.values.panelCollapsed === true;
  const section = sections.find(item => item.id === (mobileOpen ? mobileSection : currentSection));

  useEffect(() => { setMobileOpen(false); }, [pathname, searchParams]);

  useEffect(() => {
    if (!mobileOpen) return;
    const media = window.matchMedia("(min-width: 768px)");
    const onResize = () => { if (media.matches) setMobileOpen(false); };
    media.addEventListener("change", onResize);
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]',
    ) ?? []).filter(element => element.getClientRects().length > 0);
    focusables()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = focusables();
      const target = resolveFocusTrapTarget({
        inside: !!panel.current?.contains(document.activeElement),
        atFirst: document.activeElement === elements[0],
        atLast: document.activeElement === elements.at(-1),
        shiftKey: event.shiftKey,
      });
      if (target) {
        event.preventDefault();
        (target === "first" ? elements[0] : elements.at(-1))?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    const opener = menuButton.current;
    return () => {
      document.removeEventListener("keydown", handleKey);
      media.removeEventListener("change", onResize);
      opener?.focus();
    };
  }, [mobileOpen]);

  const togglePanel = () => prefs.update({ panelCollapsed: !collapsed });
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--bi-bg)] text-[var(--bi-fg)] md:flex-row">
      <header inert={mobileOpen} className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 md:hidden">
        <Link href="/flows" className="truncate text-[13px] font-bold">{brand}</Link>
        <button ref={menuButton} type="button" aria-expanded={mobileOpen} aria-controls="workspace-panel"
          onClick={() => { setMobileSection(currentSection); setMobileOpen(true); }}
          className="flex min-h-10 items-center gap-1.5 rounded px-2 focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]">
          <HiOutlineMenu size={17} aria-hidden />메뉴
        </button>
      </header>

      <nav aria-label="주 메뉴" className="hidden w-[60px] shrink-0 flex-col bg-[var(--bi-rail-bg)] text-[var(--bi-rail-muted)] md:flex">
        <Link href="/flows" aria-label={brand} title={brand} className="flex h-14 shrink-0 items-center justify-center border-b border-white/10 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-white/30 text-[12px] font-bold">PM</span>
        </Link>
        {collapsed ? <button type="button" onClick={togglePanel} disabled={!prefs.ready} aria-label="사이드바 펼치기" title="사이드바 펼치기"
          className="flex min-h-14 shrink-0 flex-col items-center justify-center gap-1 border-b border-white/10 text-[10px] hover:bg-[var(--bi-rail-active)] hover:text-white focus-visible:outline-2 focus-visible:outline-white">
          <HiOutlineChevronDoubleRight size={16} aria-hidden />펼치기
        </button> : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sections.map(item => (
            <Link key={item.id} href={item.href} title={item.title} aria-current={currentSection === item.id ? "true" : undefined}
              className={`flex min-h-[72px] flex-col items-center justify-center gap-1 border-l-[3px] px-1 py-2 text-center text-[10px] leading-[1.35] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white ${currentSection === item.id
                ? "border-[var(--bi-rail-indicator)] bg-[var(--bi-rail-active)] font-semibold text-white"
                : "border-transparent hover:bg-[var(--bi-rail-active)] hover:text-white"}`}>
              <item.icon size={18} aria-hidden /><span className="max-w-10 whitespace-pre-line break-keep">{item.railTitle}</span>
            </Link>
          ))}
        </div>

      </nav>

      <aside id="workspace-panel" ref={panel} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? "탐색 메뉴" : "상세 사이드바"}
        className={`${mobileOpen ? "fixed inset-0 z-50 flex" : "hidden"} ${collapsed ? "md:hidden" : "md:flex"} min-h-0 flex-col border-r border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] md:static md:z-auto md:w-[235px] md:shrink-0`}
        onClick={event => {
          if (mobileOpen && event.target instanceof Element && event.target.closest("a[href]")) setMobileOpen(false);
        }}>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--bi-border)] px-3 md:hidden">
          <span className="font-bold">{brand}</span>
          <button type="button" aria-label="메뉴 닫기" onClick={() => setMobileOpen(false)} className="flex min-h-10 items-center gap-1 px-2">
            <HiOutlineX size={16} aria-hidden />닫기
          </button>
        </div>
        {mobileOpen ? <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-[var(--bi-border)] px-3 text-[12px] md:hidden">
          <button type="button" onClick={() => setMobileSection(null)} className="min-h-10 px-1 font-semibold">전체 메뉴</button>
          {section ? <><HiChevronRight size={14} aria-hidden /><span>{section.title}</span></> : null}
        </div> : null}
        {section ? <>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--bi-border)] px-4">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 truncate text-[13px] font-bold">{section.title}</h2>
              <p className="mt-1 mb-0 truncate text-[10px] text-[var(--bi-muted)]">{section.description}</p>
            </div>
            <button type="button" onClick={togglePanel} disabled={!prefs.ready} aria-label="사이드바 접기" title="사이드바 접기"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--bi-muted)] hover:bg-[var(--bi-sidebar-active)] focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)] md:flex">
              <HiOutlineChevronDoubleLeft size={14} aria-hidden />
            </button>
          </header>
          {section.id === "projects" ? <AppSidebar flowProjects={flowProjects} initialProjectOrder={initialProjectOrder}
            preferences={prefs.values} onPreferenceChange={prefs.update} preferencesReady={prefs.ready} /> : (
            <nav aria-label={`${section.title} 상세 메뉴`} className="min-h-0 flex-1 overflow-y-auto py-2">
              {section.id === "today" ? <>
                <Link href="/today" aria-current={pathname === "/today" ? "page" : undefined} className={panelLink(pathname === "/today")}>오늘의 할 일</Link>
                <Link href="/today/history" aria-current={pathname === "/today/history" ? "page" : undefined} className={panelLink(pathname === "/today/history")}>완료 이력</Link>
              </> : <Link href="/guide" aria-current={pathname === "/guide" ? "page" : undefined} className={panelLink(pathname === "/guide")}>JSON 작성 가이드</Link>}
            </nav>
          )}
        </> : <nav aria-label="전체 메뉴" className="min-h-0 flex-1 overflow-y-auto p-2">
          {sections.map(item => <button key={item.id} type="button" onClick={() => setMobileSection(item.id)}
            className="flex min-h-16 w-full items-center gap-3 rounded px-3 text-left hover:bg-[var(--bi-sidebar-active)]">
            <item.icon size={20} aria-hidden />
            <span className="flex-1"><strong className="block text-[13px]">{item.title}</strong><span className="mt-1 block text-[11px] text-[var(--bi-muted)]">{item.description}</span></span>
            {currentSection === item.id ? <span className="text-[10px] text-[var(--bi-muted)]">현재</span> : null}<HiChevronRight size={16} aria-hidden />
          </button>)}
        </nav>}
      </aside>

      <main id="workspace-content" inert={mobileOpen} className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      {prefs.error ? <p role="alert" className="fixed right-3 bottom-3 left-3 z-[60] m-0 rounded border border-[var(--bi-error)] bg-[var(--bi-card-bg)] px-3 py-2 text-[12px] text-[var(--bi-error)] md:left-auto md:max-w-sm">{prefs.error}</p> : null}
      <span role="status" className="sr-only">{prefs.saving ? "공유 설정을 저장하는 중입니다." : ""}</span>
    </div>
  );
}
