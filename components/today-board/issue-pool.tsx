"use client";

import { useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi";
import { Button } from "@/components/erp/button";
import { ISSUE_DRAG_TYPE, type Issue, type IssueGroup } from "@/lib/today-board";

type IssuePoolProps = {
  groups: IssueGroup[];
  onAdd: (projectSlug: string, title: string) => void;
  onRemove: (issue: Issue) => void;
  onSendToToday: (issue: Issue) => void;
};

export function IssuePool({
  groups,
  onAdd,
  onRemove,
  onSendToToday,
}: IssuePoolProps) {
  return (
    <section
      aria-labelledby="issue-pool-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      <h3
        className="text-[13px] font-semibold text-[var(--bi-fg)]"
        id="issue-pool-heading"
      >
        프로젝트 이슈
      </h3>
      {groups.map((group) => (
        <ProjectGroup
          group={group}
          key={group.slug ?? "__ungrouped__"}
          onAdd={onAdd}
          onRemove={onRemove}
          onSendToToday={onSendToToday}
        />
      ))}
    </section>
  );
}

function ProjectGroup({
  group,
  onAdd,
  onRemove,
  onSendToToday,
}: { group: IssueGroup } & Omit<IssuePoolProps, "groups">) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!group.slug || !draft.trim()) return;
    onAdd(group.slug, draft);
    setDraft("");
  };

  return (
    <div className="overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--bi-border)] bg-[var(--bi-table-header)] px-3 py-2">
        <span className="truncate text-[12px] font-semibold text-[var(--bi-fg)]">
          {group.title}
        </span>
        <span className="shrink-0 text-[11px] text-[var(--bi-muted)]">
          {group.issues.length}건
        </span>
      </div>

      <ul className="m-0 list-none p-0">
        {group.issues.length === 0 ? (
          <li className="px-3 py-4 text-center text-[11px] text-[var(--bi-muted)]">
            쌓인 이슈가 없습니다.
          </li>
        ) : (
          group.issues.map((issue) => (
            <li
              className="flex cursor-grab items-center gap-2 border-b border-[var(--bi-border)] px-3 py-2 last:border-b-0 active:cursor-grabbing"
              draggable
              key={issue.id}
              onDragStart={(event) => {
                event.dataTransfer.setData(ISSUE_DRAG_TYPE, issue.id);
                // text/plain 도 함께 넣는다. 표준 타입이 없으면 드래그 이미지를
                // 만들지 않는 브라우저가 있다.
                event.dataTransfer.setData("text/plain", issue.title);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--bi-fg)]">
                {issue.title}
              </span>
              <button
                aria-label={`${issue.title} 오늘의 할 일로 보내기`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-accent-light)] hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
                onClick={() => onSendToToday(issue)}
                title="오늘의 할 일로"
                type="button"
              >
                <HiOutlineArrowLeft aria-hidden size={15} />
              </button>
              <button
                aria-label={`${issue.title} 삭제`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-error)]/10 hover:text-[var(--bi-error)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
                onClick={() => onRemove(issue)}
                title="삭제"
                type="button"
              >
                <HiOutlineTrash aria-hidden size={15} />
              </button>
            </li>
          ))
        )}
      </ul>

      {group.canAdd && group.slug ? (
        <form
          className="flex items-center gap-2 border-t border-[var(--bi-border)] px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            aria-label={`${group.title} 이슈 추가`}
            className="h-[30px] min-w-0 flex-1 rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 text-[12px] text-[var(--bi-fg)] outline-none placeholder:text-[var(--bi-muted)] hover:border-[var(--bi-border-strong)] focus:border-[var(--bi-accent)]"
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="새 이슈"
            value={draft}
          />
          <Button
            disabled={!draft.trim()}
            size="sm"
            type="submit"
            variant="secondary"
          >
            <HiOutlinePlus aria-hidden size={14} />
            추가
          </Button>
        </form>
      ) : null}
    </div>
  );
}
