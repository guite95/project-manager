"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/erp/button";
import { fetchHistory, type HistoryResponse } from "@/lib/api-client";
import { groupCompletionsByDate } from "@/lib/completions";
import { todayDateString } from "@/lib/today-board";

/** 한 번에 불러오는 기간. 더 보기를 누를 때마다 이만큼 과거로 넓힌다. */
const WINDOW_DAYS = 30;

function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return todayDateString(parsed);
}

/** "2026-09-09" → "2026년 9월 9일" */
function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function CompletionHistory({ flowProjects }: { flowProjects: {slug:string;title:string}[] }) {
  const today = useMemo(() => todayDateString(new Date()), []);
  const [days, setDays] = useState(WINDOW_DAYS);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  const projects = useMemo(
    () => flowProjects.map(({ slug, title }) => ({ slug, title })),
    [flowProjects],
  );

  const load = useCallback(async () => {
    setPending(true);
    try {
      setData(await fetchHistory(shiftDate(today, -(days - 1)), today));
      setError(null);
    } catch {
      setError("이력을 불러오지 못했습니다.");
    } finally {
      setPending(false);
    }
  }, [days, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () =>
      data
        ? groupCompletionsByDate(
            data.completions,
            projects,
            data.customProjects,
            data.projectOrder,
          )
        : [],
    [data, projects],
  );

  if (pending && !data) {
    return (
      <p className="py-10 text-center text-[12px] text-[var(--bi-muted)]">
        이력을 불러오는 중입니다.
      </p>
    );
  }

  if (error) {
    return (
      <p className="py-10 text-center text-[12px] text-[var(--bi-error)]">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {grouped.length === 0 ? (
        <p className="py-10 text-center text-[12px] text-[var(--bi-muted)]">
          최근 {days}일 안에 완료한 항목이 없습니다.
        </p>
      ) : (
        grouped.map((day) => (
          <section
            className="overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]"
            key={day.date}
          >
            <h2 className="flex items-baseline gap-2 border-b border-[var(--bi-border)] bg-[var(--bi-table-header)] px-4 py-2.5 text-[12px] font-semibold text-[var(--bi-fg)]">
              {formatDate(day.date)}
              <span className="font-normal text-[var(--bi-muted)]">
                {day.groups.reduce(
                  (sum, group) => sum + group.issues.length,
                  0,
                )}
                건
              </span>
            </h2>
            <div className="flex flex-col gap-3 px-4 py-3">
              {day.groups.map((group) => (
                <div key={group.slug ?? "ungrouped"}>
                  <p className="mb-1 text-[11px] font-semibold text-[var(--bi-muted)]">
                    {group.title}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {group.issues.map((issue) => (
                      <li
                        className="text-[13px] text-[var(--bi-fg)]"
                        key={issue.id}
                      >
                        {issue.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <Button
        className="mx-auto"
        disabled={pending}
        onClick={() => setDays((current) => current + WINDOW_DAYS)}
        variant="secondary"
      >
        {pending ? "불러오는 중…" : `이전 ${WINDOW_DAYS}일 더 보기`}
      </Button>
    </div>
  );
}
