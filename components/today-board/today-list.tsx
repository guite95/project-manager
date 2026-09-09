"use client";

import { useState } from "react";
import { HiOutlineArrowRight } from "react-icons/hi";
import { Badge } from "@/components/erp/badge";
import {
  ISSUE_DRAG_TYPE,
  UNGROUPED_TITLE,
  type TodayItem,
} from "@/lib/today-board";

type TodayListProps = {
  date: string;
  items: TodayItem[];
  projectTitles: Record<string, string>;
  onToggle: (item: TodayItem) => void;
  onReturn: (item: TodayItem) => void;
  onDropIssue: (issueId: string) => void;
};

/** "2026-09-09" → "9월 9일 (수)". 클라이언트에서만 렌더하므로 하이드레이션 걱정이 없다. */
function formatBoardDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

export function TodayList({
  date,
  items,
  projectTitles,
  onToggle,
  onReturn,
  onDropIssue,
}: TodayListProps) {
  const [dragOver, setDragOver] = useState(false);
  const doneCount = items.filter((item) => item.done).length;

  return (
    <section
      aria-labelledby="today-list-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3
          className="text-[13px] font-semibold text-[var(--bi-fg)]"
          id="today-list-heading"
        >
          오늘의 할 일
        </h3>
        <span className="shrink-0 text-[11px] text-[var(--bi-muted)]">
          {formatBoardDate(date)} · {doneCount}/{items.length} 완료
        </span>
      </div>

      <div
        className={`rounded-[4px] border transition ${
          dragOver
            ? "border-dashed border-[var(--bi-accent)] bg-[var(--bi-accent-light)]"
            : "border-[var(--bi-border)] bg-[var(--bi-card-bg)]"
        }`}
        onDragLeave={(event) => {
          // 자식 위로 옮겨갈 때도 dragleave 가 뜬다. 영역 밖으로 나간 것만 센다.
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) return;
          event.preventDefault();
          setDragOver(false);
          const issueId = event.dataTransfer.getData(ISSUE_DRAG_TYPE);
          if (issueId) onDropIssue(issueId);
        }}
      >
        {items.length === 0 ? (
          <p className="m-0 px-3 py-10 text-center text-[11px] text-[var(--bi-muted)]">
            오른쪽 이슈를 끌어다 놓으세요.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {items.map((item) => (
              <li
                className="flex items-center gap-2 border-b border-[var(--bi-border)] px-3 py-2 last:border-b-0"
                key={item.id}
              >
                <input
                  checked={item.done}
                  className="h-3.5 w-3.5 shrink-0 accent-[var(--bi-accent)]"
                  id={`today-item-${item.id}`}
                  onChange={() => onToggle(item)}
                  type="checkbox"
                />
                <label
                  className={`min-w-0 flex-1 truncate text-[12px] ${
                    item.done
                      ? "text-[var(--bi-muted)] line-through"
                      : "text-[var(--bi-fg)]"
                  }`}
                  htmlFor={`today-item-${item.id}`}
                >
                  {item.title}
                </label>
                <span className="shrink-0">
                  <Badge variant="neutral">
                    {projectTitles[item.projectSlug] ?? UNGROUPED_TITLE}
                  </Badge>
                </span>
                <button
                  aria-label={`${item.title} 이슈 목록으로 되돌리기`}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-accent-light)] hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
                  onClick={() => onReturn(item)}
                  title="되돌리기"
                  type="button"
                >
                  <HiOutlineArrowRight aria-hidden size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
