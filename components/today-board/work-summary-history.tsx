"use client";

import { useState } from "react";
import { HiOutlineClipboardCopy } from "react-icons/hi";
import { Dropdown } from "@/components/erp/dropdown";
import { Button } from "@/components/erp/button";
import {
  formatWorkSummary,
  groupWorkSummary,
  type WorkSource,
  type WorkSummary,
} from "@/lib/work-summary";
import { formatSeoulDateTime } from "@/lib/format/date-time";

function Source({ source }: { source: WorkSource }) {
  return (
    <li className="break-words text-[11px] text-[var(--bi-muted)]">
      <span className="font-medium">
        {source.kind === "git"
          ? `Git · ${source.repository} · ${source.commit?.slice(0, 8)}`
          : source.kind === "ai"
            ? `AI 대화 · ${source.aiSource} · ${source.role === "USER" ? "요청" : "응답"} · ${formatSeoulDateTime(source.occurredAt!)}`
            : "완료 체크"}
      </span>
      {" — "}
      {source.title}
      {source.kind === "ai" && (
        <span className="block">세션 {source.sessionId} · 메시지 {source.messageId}{source.bodyAvailable ? "" : " · 본문 없음"}</span>
      )}
    </li>
  );
}
export function WorkSummaryHistory({
  report,
  date,
  dates,
}: {
  report: WorkSummary | null;
  date: string;
  dates: string[];
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const groups = report ? groupWorkSummary(report) : [];
  const sources = new Map(report?.evidence.sources.map((s) => [s.id, s]) ?? []);
  const warnings =
    report?.evidence.repositories.filter((r) => r.status !== "ok") ?? [];
  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(formatWorkSummary(report));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          action="/today/history"
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="view" value="summary" />
          <label
            htmlFor="summary-date"
            className="text-xs text-[var(--bi-muted)]"
          >
            날짜
          </label>
          <input
            id="summary-date"
            name="date"
            type="date"
            defaultValue={date}
            required
            className="rounded border border-[var(--bi-border)] bg-[var(--bi-bg)] px-2 py-1 text-xs"
          />
          <Button variant="secondary" size="sm" type="submit">
            조회
          </Button>
        </form>
        <div className="flex items-center gap-2">
          <span role="status" className="text-xs text-[var(--bi-muted)]">
            {copyState === "copied"
              ? "복사했습니다."
              : copyState === "failed"
                ? "복사하지 못했습니다. 브라우저 권한을 확인하세요."
                : ""}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!report?.summary.items.length}
            onClick={copy}
          >
            <HiOutlineClipboardCopy aria-hidden size={14} />
            작업내용 복사
          </Button>
        </div>
      </div>
      {dates.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--bi-muted)]">
          <span>저장된 정리</span>
          <Dropdown ariaLabel="저장된 작업 정리" searchable value={dates.includes(date) ? date : ''}
            options={[...(!dates.includes(date) ? [{ value: '', label: '날짜 선택' }] : []), ...dates.map(d => ({ value: d, label: d }))]}
            onChange={value => { if (value) window.location.assign(`/today/history?view=summary&date=${encodeURIComponent(value)}`); }} />
        </div>
      )}
      {!report ? (
        <div className="rounded border border-dashed border-[var(--bi-border)] px-4 py-12 text-center text-[var(--bi-muted)]">
          <p className="text-sm">{date}에 저장된 작업 정리가 없습니다.</p>
          <p className="mt-2 text-xs">
            work-sum에 이 날짜의 작업 정리를 요청하면 Git 기록·완료 체크·AI 대화를
            모아 여기에 저장합니다.
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
          <div className="border-b border-[var(--bi-border)] bg-[var(--bi-table-header)] px-4 py-3">
            <h2 className="text-[13px] font-semibold">
              {date} 작업 정리{" "}
              <span className="font-normal text-[var(--bi-muted)]">
                · {report.summary.items.length}건
              </span>
            </h2>
            <p className="mt-1 text-[11px] text-[var(--bi-muted)]">
              {formatSeoulDateTime(report.savedAt)} 저장 · Git{" "}
              {report.evidence.sources.filter((s) => s.kind === "git").length}건
              · 완료 체크{" "}
              {
                report.evidence.sources.filter((s) => s.kind === "completion")
                  .length
              }
              건
              {report.evidence.ai && ` · AI 메시지 ${report.evidence.ai.messages}건`}
            </p>
          </div>
          <div className="flex flex-col gap-5 p-4">
            {groups.length === 0 && (
              <p className="text-xs text-[var(--bi-muted)]">
                정리된 작업이 없습니다. 수집 상태와 제외 기록을 확인하세요.
              </p>
            )}
            {groups.map((group) => (
              <div key={group.key}>
                <h3 className="mb-2 text-xs font-semibold text-[var(--bi-muted)]">
                  {group.title}
                </h3>
                <ul className="flex flex-col gap-3">
                  {group.items.map((item, index) => (
                    <li key={index}>
                      <p className="break-words text-[13px]">{item.title}</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-[var(--bi-muted)]">
                          근거 {item.sourceIds.length}건
                        </summary>
                        <ul className="mt-1 flex flex-col gap-1 pl-3">
                          {item.sourceIds.map((id) => (
                            <Source key={id} source={sources.get(id)!} />
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {report.summary.excluded.length > 0 && (
              <details className="border-t border-[var(--bi-border)] pt-3">
                <summary className="cursor-pointer text-xs text-[var(--bi-muted)]">
                  정리에서 제외한 기록 {report.summary.excluded.length}건
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {report.summary.excluded.map((x) => (
                    <li key={x.sourceId} className="text-xs">
                      <p>{x.reason}</p>
                      <ul>
                        <Source source={sources.get(x.sourceId)!} />
                      </ul>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details className="border-t border-[var(--bi-border)] pt-3">
              <summary className="cursor-pointer text-xs text-[var(--bi-muted)]">
                수집 상태 · 저장소 {report.evidence.repositories.length}개
                {warnings.length ? ` · 확인 필요 ${warnings.length}개` : ""}
              </summary>
              <p className="mt-2 text-[11px] text-[var(--bi-muted)]">
                한국 시간 커밋·완료·메시지 날짜 기준 ·{" "}
                {formatSeoulDateTime(report.evidence.collectedAt)} 수집본
              </p>
              {report.evidence.ai && (
                <div className="mt-2 text-[11px] text-[var(--bi-muted)]">
                  <p>AI 세션 {report.evidence.ai.sessions}개 · 본문 미수집 {report.evidence.ai.missingBodies}건</p>
                  {report.evidence.ai.devices.length === 0 && <p>등록된 AI 수집 기기가 없습니다.</p>}
                  {report.evidence.ai.devices.map((device, index) => (
                    <p key={index}>{device.name} · 마지막 수신 {formatSeoulDateTime(device.lastSyncAt)} · 오류 {device.errors}건</p>
                  ))}
                </div>
              )}
              <ul className="mt-2 flex flex-col gap-1 text-[11px] text-[var(--bi-muted)]">
                {report.evidence.repositories.map((r) => (
                  <li key={r.path} className="break-words">
                    {r.path} · {r.status === "ok" ? "수집 완료" : r.reason}{" "}
                    {r.authorEmails.length > 0 &&
                      `(${r.authorEmails.join(", ")})`}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
      )}
    </div>
  );
}
