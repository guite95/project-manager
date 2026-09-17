"use client";

import { useId, useState } from "react";
import {
  HiChevronRight,
  HiOutlineArrowLeft,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePlus,
  HiOutlineSelector,
  HiOutlineTrash,
} from "react-icons/hi";
import { EditButton, InlineEdit } from "@/components/inline-edit";
import { Button } from "@/components/erp/button";
import {
  ISSUE_DRAG_TYPE,
  PROJECT_DRAG_TYPE,
  PERSONAL_ISSUES_SLUG,
  type Issue,
  type IssueGroup,
} from "@/lib/today-board";

type IssuePoolProps = {
  groups: IssueGroup[];
  personalGroups: IssueGroup[];
  onAdd: (projectSlug: string, title: string) => void;
  onRemove: (issue: Issue) => void;
  onRename: (issue: Issue, title: string) => void;
  onSendToToday: (issue: Issue) => void;
  onRemoveProject: (group: IssueGroup) => void;
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
  personalGroups,
  onAdd,
  onRemove,
  onRename,
  onSendToToday,
  onRemoveProject,
  onMoveProject,
  onStepProject,
  collapsedSlugs,
  onToggleCollapsed,
}: IssuePoolProps) {
  const [activeTab, setActiveTab] = useState<"project" | "personal">("project");
  const tabId = useId();
  const tabs = [{ id: "project", title: "프로젝트 이슈" }, { id: "personal", title: "개인 이슈" }] as const;
  // 순서를 바꿀 수 있는 그룹만 센다 (미분류는 항상 마지막이라 제외).
  const movable = groups.filter((group) => group.slug !== null);
  const personalMovable = personalGroups.filter(group => group.slug !== null && group.slug !== PERSONAL_ISSUES_SLUG);

  return (
    <section
      aria-labelledby="issue-pool-heading"
      className="flex min-w-0 flex-col gap-3 lg:min-h-0"
    >
      {/* 왼쪽 "오늘의 할 일" 머리글(최소 높이 26px)과 높이를 맞춰야
          아래 박스들의 윗선이 두 칼럼에서 나란히 놓인다. */}
      <h3 className="sr-only" id="issue-pool-heading">이슈 목록</h3>
      <div role="tablist" aria-label="이슈 구분" className="flex h-[26px] shrink-0 items-stretch gap-5"
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : activeTab === "project" ? 1 : 0;
          setActiveTab(tabs[next].id);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>
        {tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`${tabId}-${tab.id}-tab`}
          aria-controls={`${tabId}-${tab.id}-panel`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => setActiveTab(tab.id)}
          className={`border-b-2 px-0.5 pb-1 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bi-accent)] ${activeTab === tab.id ? "border-[var(--bi-accent)] font-semibold text-[var(--bi-accent)]" : "border-transparent font-medium text-[var(--bi-muted)] hover:text-[var(--bi-fg)]"}`}>
          {tab.title}
        </button>)}
      </div>
      <div role="tabpanel" id={`${tabId}-project-panel`} aria-labelledby={`${tabId}-project-tab`}
        className={activeTab === "project" ? "flex min-h-0 flex-col gap-3 lg:flex-1" : "hidden"}>
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
            onRename={onRename}
            onSendToToday={onSendToToday}
            onStepProject={onStepProject}
            onToggleCollapsed={onToggleCollapsed}
          />
        );
      })}
      </div>
      </div>
      <div role="tabpanel" id={`${tabId}-personal-panel`} aria-labelledby={`${tabId}-personal-tab`}
        className={activeTab === "personal" ? "flex min-h-0 flex-col gap-3 lg:flex-1 lg:overflow-y-auto" : "hidden"}>
        {personalGroups.map(group => {
          const index = personalMovable.findIndex(entry => entry.slug === group.slug);
          return <ProjectGroup key={group.slug ?? "__personal__"} group={group}
            collapsed={group.slug !== null && group.slug !== PERSONAL_ISSUES_SLUG && collapsedSlugs.includes(group.slug)}
            isFirst={index === 0} isLast={index === personalMovable.length - 1}
            onAdd={onAdd} onRemove={onRemove} onRename={onRename}
            onSendToToday={onSendToToday} onMoveProject={onMoveProject} onRemoveProject={onRemoveProject}
            onStepProject={onStepProject} onToggleCollapsed={onToggleCollapsed} />;
        })}
      </div>
    </section>
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
  onRename,
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
  | "onRename"
  | "onSendToToday"
  | "onStepProject"
  | "onToggleCollapsed"
>) {
  const [draft, setDraft] = useState("");
  // 한 번에 한 항목만 편집한다. 그룹 단위로 들고 있으면 충분하다.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dropEdge, setDropEdge] = useState<"before" | "after" | null>(null);
  // 핸들을 잡았을 때만 그룹이 끌린다. 안쪽 이슈 카드 드래그와 섞이지 않게 한다.
  const [handleHeld, setHandleHeld] = useState(false);

  const movable = group.slug !== null && group.slug !== PERSONAL_ISSUES_SLUG;

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
              className="flex items-center gap-2 border-b border-[var(--bi-border)] px-3 py-2 last:border-b-0 data-[grabbable=true]:cursor-grab data-[grabbable=true]:active:cursor-grabbing"
              data-grabbable={editingId !== issue.id}
              // 편집 중에는 끌 수 없다. 입력칸 안에서 글자를 고르려 드래그하면
              // 행이 끌려가 버리기 때문이다.
              draggable={editingId !== issue.id}
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
              <InlineEdit
                editing={editingId === issue.id}
                inputClassName="min-w-0 flex-1 rounded-[3px] border border-[var(--bi-accent)] bg-[var(--bi-bg)] px-1.5 py-0.5 text-[12px] text-[var(--bi-fg)] outline-none"
                label="이슈 제목"
                onCancel={() => setEditingId(null)}
                onCommit={(next) => {
                  setEditingId(null);
                  onRename(issue, next);
                }}
                value={issue.title}
              >
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--bi-fg)]">
                  {issue.title}
                </span>
              </InlineEdit>
              <button
                aria-label={`${issue.title} 오늘의 할 일로 보내기`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-accent-light)] hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
                onClick={() => onSendToToday(issue)}
                title="오늘의 할 일로"
                type="button"
              >
                <HiOutlineArrowLeft aria-hidden size={15} />
              </button>
              <EditButton
                label={`${issue.title} 수정`}
                onClick={() => setEditingId(issue.id)}
              />
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
