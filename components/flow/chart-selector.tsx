"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { HiChevronDown, HiCheck } from "react-icons/hi";
import type { FlowChart } from "./types";
import { chartHref } from "@/lib/flows/registry";

type ChartOption = Pick<FlowChart, "slug" | "title" | "description" | "erdDomain">;
const badge = "shrink-0 rounded-[3px] bg-[var(--bi-accent-light)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--bi-accent)]";

export function ChartSelector({ projectSlug, projectTitle, categorySlug, categoryTitle, charts, selectedSlug }: {
  projectSlug: string;
  projectTitle: string;
  categorySlug: string;
  categoryTitle: string;
  charts: ChartOption[];
  selectedSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef(false);
  const selected = charts.find(chart => chart.slug === selectedSlug) ?? charts[0];

  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current) {
      root.current?.querySelector<HTMLElement>('a[aria-current="page"]')?.focus();
      focusOnOpen.current = false;
    }
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  if (!selected) return null;
  return (
    <div className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] px-4 py-2 md:px-6">
      <nav aria-label="위치" className="min-w-0 text-[11px] text-[var(--bi-muted)]">
        <Link href="/flows" className="hover:text-[var(--bi-fg)]">{projectTitle}</Link>
        <span aria-hidden className="mx-1.5">/</span><span>{categoryTitle}</span>
      </nav>
      <div className="relative min-w-0 w-full sm:w-[28rem] sm:max-w-full" ref={root}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
        onKeyDown={event => {
          if (event.key === "Escape" && open) {
            event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
          }
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          if (!open) { focusOnOpen.current = true; setOpen(true); return; }
          const links = Array.from(root.current?.querySelectorAll<HTMLAnchorElement>("nav a") ?? []);
          const index = links.findIndex(link => link === document.activeElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
          links[next]?.focus();
        }}>
        <button type="button" ref={trigger} aria-expanded={open} aria-controls={open ? id : undefined}
          aria-label={`차트 선택: ${selected.title}`} onClick={() => setOpen(current => !current)}
          className="flex min-h-9 w-full items-center gap-2 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]">
          <span className={badge}>{selected.erdDomain ? "ERD" : "차트"}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{selected.title}</span>
          <span className="shrink-0 text-[10px] text-[var(--bi-muted)]">{charts.length}</span>
          <HiChevronDown size={14} aria-hidden className={`shrink-0 text-[var(--bi-muted)] ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? <nav id={id} aria-label={`${categoryTitle} 차트 목록`}
          className="absolute top-[calc(100%+4px)] left-0 z-30 max-h-[65dvh] w-full overflow-y-auto rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] py-1 shadow-sm">
          {charts.map(chart => <Link key={chart.slug} href={chartHref(projectSlug, categorySlug, chart.slug)}
            aria-current={chart.slug === selectedSlug ? "page" : undefined}
            onClick={() => { setOpen(false); trigger.current?.focus(); }}
            className={`flex min-h-12 items-start gap-2 px-3 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--bi-accent)] ${chart.slug === selectedSlug ? "bg-[var(--bi-accent-light)]" : "hover:bg-[var(--bi-sidebar-bg)]"}`}>
            <span className={badge}>{chart.erdDomain ? "ERD" : "차트"}</span>
            <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{chart.title}</span>
              {chart.description ? <span className="mt-1 block text-[11px] leading-relaxed text-[var(--bi-muted)]">{chart.description}</span> : null}
            </span>
            {chart.slug === selectedSlug ? <HiCheck size={14} aria-hidden className="mt-0.5 shrink-0 text-[var(--bi-accent)]" /> : null}
          </Link>)}
        </nav> : null}
      </div>
    </div>
  );
}
