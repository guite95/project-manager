"use client";

import { useState } from "react";
import {
  HiChevronRight,
  HiOutlineArrowLeft,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePlus,
  HiOutlineSelector,
  HiOutlineTrash,
} from "react-icons/hi";
import { Button } from "@/components/erp/button";
import {
  ISSUE_DRAG_TYPE,
  PROJECT_DRAG_TYPE,
  type Issue,
  type IssueGroup,
} from "@/lib/today-board";

type IssuePoolProps = {
  groups: IssueGroup[];
  onAdd: (projectSlug: string, title: string) => void;
  onRemove: (issue: Issue) => void;
  onSendToToday: (issue: Issue) => void;
  onAddProject: (title: string) => void;
  onRemoveProject: (group: IssueGroup) => void;
  isProjectTitleTaken: (title: string) => boolean;
  onMoveProject: (
    slug: string,
    targetSlug: string,
    position: "before" | "after",
  ) => void;
  onStepProject: (slug: string, delta: -1 | 1) => void;
  collapsedSlugs: string[];
  onToggleCollapsed: (slug: string) => void;
};

export function IssuePool({
  groups,
  onAdd,
  onRemove,
  onSendToToday,
  onAddProject,
  onRemoveProject,
  isProjectTitleTaken,
  onMoveProject,
  onStepProject,
  collapsedSlugs,
  onToggleCollapsed,
}: IssuePoolProps) {
  // 순서를 바꿀 수 있는 그룹만 센다 (미분류는 항상 마지막이라 제외).
  const movable = groups.filter((group) => group.slug !== null);

  return (
    <section
      aria-labelledby="issue-pool-heading"
      className="flex min-w-0 flex-col gap-3 lg:min-h-0"
    >
      <h3
        className="shrink-0 text-[13px] font-semibold text-[var(--bi-fg)]"
        id="issue-pool-heading"
      >
        프로젝트 이슈
      </h3>
      <AddProjectForm
        isProjectTitleTaken={isProjectTitleTaken}
        onAddProject={onAddProject}
      />
      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      {groups.map((group) => {
        const index = movable.findIndex((entry) => entry.slug === group.slug);
        return (
          <ProjectGroup
            collapsed={
              group.slug !== null && collapsedSlugs.includes(group.slug)
            }
            group={group}
            isFirst={index === 0}
            isLast={index === movable.length - 1}
            key={group.slug ?? "__ungrouped__"}
            onAdd={onAdd}
            onMoveProject={onMoveProject}
            onRemove={onRemove}
            onRemoveProject={onRemoveProject}
            onSendToToday={onSendToToday}
            onStepProject={onStepProject}
            onToggleCollapsed={onToggleCollapsed}
          />
        );
      })}
      </div>
    </section>
  );
}

function AddProjectForm({
  onAddProject,
  isProjectTitleTaken,
}: Pick<IssuePoolProps, "onAddProject" | "isProjectTitleTaken">) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const taken = isProjectTitleTaken(draft);

  return (
    <form
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-[4px] border border-dashed border-[var(--bi-border-strong)] px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || taken) return;
        onAddProject(draft);
        setDraft("");
      }}
    >
      <input
        aria-label="프로젝트 추가"
        className="h-[30px] min-w-0 flex-1 rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 text-[12px] text-[var(--bi-fg)] outline-none placeholder:text-[var(--bi-muted)] hover:border-[var(--bi-border-strong)] focus:border-[var(--bi-accent)]"
        maxLength={40}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="새 프로젝트"
        value={draft}
      />
      <Button disabled={!trimmed || taken} size="sm" type="submit">
        <HiOutlinePlus aria-hidden size={14} />
        프로젝트 추가
      </Button>
      {taken ? (
        <p
          aria-live="polite"
          className="m-0 w-full text-[11px] text-[var(--bi-error)]"
        >
          이미 같은 이름의 프로젝트가 있습니다.
        </p>
      ) : null}
    </form>
  );
}

function ProjectGroup({
  collapsed,
  group,
  isFirst,
  isLast,
  onAdd,
  onMoveProject,
  onRemove,
  onRemoveProject,
  onSendToToday,
  onStepProject,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  group: IssueGroup;
  isFirst: boolean;
  isLast: boolean;
} & Pick<
  IssuePoolProps,
  | "onAdd"
  | "onMoveProject"
  | "onRemove"
  | "onRemoveProject"
  | "onSendToToday"
  | "onStepProject"
  | "onToggleCollapsed"
>) {
  const [draft, setDraft] = useState("");
  const [dropEdge, setDropEdge] = useState<"before" | "after" | null>(null);
  // 핸들을 잡았을 때만 그룹이 끌린다. 안쪽 이슈 카드 드래그와 섞이지 않게 한다.
  const [handleHeld, setHandleHeld] = useState(false);

  const movable = group.slug !== null;

  const submit = () => {
    if (!group.slug || !draft.trim()) return;
    onAdd(group.slug, draft);
    setDraft("");
  };

  const edgeFor = (event: { clientY: number; currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] ${
        dropEdge === "before"
          ? "border-t-2 border-t-[var(--bi-accent)]"
          : dropEdge === "after"
            ? "border-b-2 border-b-[var(--bi-accent)]"
            : ""
      }`}
      draggable={handleHeld}
      onDragEnd={() => {
        setHandleHeld(false);
        setDropEdge(null);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDropEdge(null);
      }}
      onDragOver={(event) => {
        if (!movable) return;
        if (!event.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropEdge(edgeFor(event));
      }}
      onDragStart={(event) => {
        // 안쪽 이슈 카드의 dragstart 가 여기까지 버블링된다. 그룹 자신이
        // 시작한 드래그가 아니면 손대지 않는다 — 그러지 않으면 이슈를 끄는
        // 동안에도 그룹 드롭이 반응한다.
        if (event.target !== event.currentTarget) return;
        if (!group.slug) return;
        event.dataTransfer.setData(PROJECT_DRAG_TYPE, group.slug);
        event.dataTransfer.setData("text/plain", group.title);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDrop={(event) => {
        if (!movable || !group.slug) return;
        if (!event.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return;
        event.preventDefault();
        const edge = edgeFor(event);
        setDropEdge(null);
        const draggedSlug = event.dataTransfer.getData(PROJECT_DRAG_TYPE);
        if (draggedSlug) onMoveProject(draggedSlug, group.slug, edge);
      }}
    >
      <div
        className={`flex items-center gap-2 bg-[var(--bi-table-header)] px-3 py-2 ${
          collapsed ? "" : "border-b border-[var(--bi-border)]"
        }`}
      >
        {movable && group.slug ? (
          <button
            aria-controls={`project-body-${group.slug}`}
            aria-expanded={!collapsed}
            aria-label={`${group.title} ${collapsed ? "펼치기" : "접기"}`}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-accent-light)] hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
            onClick={() => onToggleCollapsed(group.slug as string)}
            type="button"
          >
            <HiChevronRight
              aria-hidden
              className={`transition-transform ${collapsed ? "" : "rotate-90"}`}
              size={12}
            />
          </button>
        ) : null}
        {movable && group.slug ? (
          <>
            <span
              aria-hidden
              className="shrink-0 cursor-grab text-[var(--bi-muted)] active:cursor-grabbing"
              onMouseDown={() => setHandleHeld(true)}
              onMouseUp={() => setHandleHeld(false)}
              title="끌어서 순서 변경"
            >
              <HiOutlineSelector size={14} />
            </span>
            <span className="flex shrink-0 flex-col">
              <button
                aria-label={`${group.title} 위로 옮기기`}
                className="inline-flex h-3.5 w-4 items-center justify-center rounded-[2px] text-[var(--bi-muted)] outline-none transition hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)] disabled:opacity-30 disabled:hover:text-[var(--bi-muted)]"
                disabled={isFirst}
                onClick={() => onStepProject(group.slug as string, -1)}
                type="button"
              >
                <HiOutlineChevronUp aria-hidden size={11} />
              </button>
              <button
                aria-label={`${group.title} 아래로 옮기기`}
                className="inline-flex h-3.5 w-4 items-center justify-center rounded-[2px] text-[var(--bi-muted)] outline-none transition hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)] disabled:opacity-30 disabled:hover:text-[var(--bi-muted)]"
                disabled={isLast}
                onClick={() => onStepProject(group.slug as string, 1)}
                type="button"
              >
                <HiOutlineChevronDown aria-hidden size={11} />
              </button>
            </span>
          </>
        ) : null}
        <span className="truncate text-[12px] font-semibold text-[var(--bi-fg)]">
          {group.title}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-[var(--bi-muted)]">
          {group.issues.length}건
        </span>
        {group.removable ? (
          <button
            aria-label={`${group.title} 프로젝트 삭제`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-error)]/10 hover:text-[var(--bi-error)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
            onClick={() => onRemoveProject(group)}
            title="프로젝트 삭제"
            type="button"
          >
            <HiOutlineTrash aria-hidden size={14} />
          </button>
        ) : null}
      </div>

      {/* 접으면 헤더 한 줄만 남는다. */}
      <div hidden={collapsed} id={group.slug ? `project-body-${group.slug}` : undefined}>
      {/* 이슈가 5개를 넘으면 그룹 안에서 스크롤한다 (한 행 45px × 5). */}
      <ul className="m-0 max-h-[225px] list-none overflow-y-auto p-0">
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
                // 그룹 드래그와 섞이지 않게 여기서 끊는다.
                event.stopPropagation();
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
    </div>
  );
}
