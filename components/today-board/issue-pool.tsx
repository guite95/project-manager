"use client";

import { useEffect, useId, useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi";
import { EditButton, InlineEdit } from "@/components/inline-edit";
import { Button } from "@/components/erp/button";
import {
  ISSUE_DRAG_TYPE,
  PERSONAL_ISSUES_SLUG,
  PROJECT_DRAG_TYPE,
  issueGroupTabKey,
  parseIssueDragIds,
  selectIssueGroup,
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
  onMoveProject: (slug: string, targetSlug: string, position: "before" | "after") => void;
  onDropIssuesToProject: (issueIds: string[], projectSlug: string) => void;
};

const CATEGORY_TABS = [
  { id: "project", title: "프로젝트 이슈" },
  { id: "personal", title: "개인 이슈" },
] as const;

type CategoryId = (typeof CATEGORY_TABS)[number]["id"];

export function IssuePool({
  groups,
  personalGroups,
  onAdd,
  onRemove,
  onRename,
  onSendToToday,
  onRemoveProject,
  onMoveProject,
  onDropIssuesToProject,
}: IssuePoolProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("project");
  const tabId = useId();

  return (
    <section
      aria-labelledby="issue-pool-heading"
      className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1"
    >
      <h3 className="sr-only" id="issue-pool-heading">
        이슈 목록
      </h3>
      <div
        aria-label="이슈 구분"
        className="flex h-[26px] shrink-0 items-stretch gap-5"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            return;
          }
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? CATEGORY_TABS.length - 1
                : activeCategory === "project"
                  ? 1
                  : 0;
          setActiveCategory(CATEGORY_TABS[next].id);
          event.currentTarget
            .querySelectorAll<HTMLButtonElement>('[role="tab"]')
            [next]?.focus();
        }}
        role="tablist"
      >
        {CATEGORY_TABS.map((tab) => (
          <button
            aria-controls={`${tabId}-${tab.id}-panel`}
            aria-selected={activeCategory === tab.id}
            className={`border-b-2 px-0.5 pb-1 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bi-accent)] ${
              activeCategory === tab.id
                ? "border-[var(--bi-accent)] font-semibold text-[var(--bi-accent)]"
                : "border-transparent font-medium text-[var(--bi-muted)] hover:text-[var(--bi-fg)]"
            }`}
            id={`${tabId}-${tab.id}-tab`}
            key={tab.id}
            onClick={() => setActiveCategory(tab.id)}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) return;
              event.preventDefault();
              if (activeCategory !== tab.id) setActiveCategory(tab.id);
            }}
            onDrop={(event) => {
              if (event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) event.preventDefault();
            }}
            role="tab"
            tabIndex={activeCategory === tab.id ? 0 : -1}
            type="button"
          >
            {tab.title}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`${tabId}-project-tab`}
        className={activeCategory === "project" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        id={`${tabId}-project-panel`}
        role="tabpanel"
      >
        <IssueGroupTabs
          groups={groups}
          label="프로젝트별 이슈"
          onAdd={onAdd}
          onRemove={onRemove}
          onRemoveProject={onRemoveProject}
          onRename={onRename}
          onSendToToday={onSendToToday}
          onMoveProject={onMoveProject}
          onDropIssuesToProject={onDropIssuesToProject}
        />
      </div>
      <div
        aria-labelledby={`${tabId}-personal-tab`}
        className={activeCategory === "personal" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        id={`${tabId}-personal-panel`}
        role="tabpanel"
      >
        <IssueGroupTabs
          groups={personalGroups}
          label="개인 프로젝트별 이슈"
          onAdd={onAdd}
          onRemove={onRemove}
          onRemoveProject={onRemoveProject}
          onRename={onRename}
          onSendToToday={onSendToToday}
          onMoveProject={onMoveProject}
          onDropIssuesToProject={onDropIssuesToProject}
        />
      </div>
    </section>
  );
}

function IssueGroupTabs({
  groups,
  label,
  onAdd,
  onRemove,
  onRemoveProject,
  onRename,
  onSendToToday,
  onMoveProject,
  onDropIssuesToProject,
}: { groups: IssueGroup[]; label: string } & Omit<
  IssuePoolProps,
  "groups" | "personalGroups"
>) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draggedSlug, setDraggedSlug] = useState<string | null>(null);
  const [issueDropSlug, setIssueDropSlug] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    slug: string;
    position: "before" | "after";
  } | null>(null);
  const tabId = useId();
  const selectedGroup = selectIssueGroup(groups, activeKey);
  const selectedKey = selectedGroup ? issueGroupTabKey(selectedGroup) : null;
  const movable = groups.filter(
    (group) => group.slug !== null && group.slug !== PERSONAL_ISSUES_SLUG,
  );

  useEffect(() => {
    const clearDropState = () => {
      setDraggedSlug(null);
      setDropTarget(null);
      setIssueDropSlug(null);
    };
    window.addEventListener("dragend", clearDropState);
    return () => {
      window.removeEventListener("dragend", clearDropState);
    };
  }, []);

  if (!selectedGroup || !selectedKey) {
    return (
      <p className="rounded-[4px] border border-[var(--bi-border)] px-3 py-8 text-center text-[11px] text-[var(--bi-muted)]">
        표시할 프로젝트가 없습니다.
      </p>
    );
  }

  const tabIndexAfterKey = (currentIndex: number, key: string) => {
    if (key === "Home") return 0;
    if (key === "End") return groups.length - 1;
    if (key === "ArrowLeft") return (currentIndex - 1 + groups.length) % groups.length;
    return (currentIndex + 1) % groups.length;
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div
        className="-mx-1 shrink-0 overflow-x-auto px-1 pb-1"
        onDragOver={(event) => {
          if (!draggedSlug && !event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left + 32) event.currentTarget.scrollLeft -= 16;
          else if (event.clientX > bounds.right - 32) event.currentTarget.scrollLeft += 16;
        }}
      >
        <div aria-label={label} className="flex min-w-max items-stretch gap-5" role="tablist">
          {groups.map((group, index) => {
            const key = issueGroupTabKey(group);
            const selected = key === selectedKey;
            const canMove = group.slug !== null && group.slug !== PERSONAL_ISSUES_SLUG;
            const canReceiveIssues = group.slug !== null && group.canAdd;
            return (
              <button
                aria-controls={`${tabId}-panel`}
                aria-selected={selected}
                className={`shrink-0 border-b-2 px-0.5 pb-1 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bi-accent)] ${
                  selected
                    ? "border-[var(--bi-accent)] font-semibold text-[var(--bi-accent)]"
                    : "border-transparent font-medium text-[var(--bi-muted)] hover:text-[var(--bi-fg)]"
                } ${canMove ? "cursor-grab active:cursor-grabbing" : ""} ${
                  draggedSlug !== null && draggedSlug === group.slug ? "opacity-50" : ""
                } ${issueDropSlug !== null && issueDropSlug === group.slug ? "bg-blue-100" : ""
                }`}
                draggable={canMove}
                id={`${tabId}-${index}-tab`}
                key={key}
                onClick={() => setActiveKey(key)}
                onDragEnd={() => {
                  setDraggedSlug(null);
                  setDropTarget(null);
                  setIssueDropSlug(null);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                  if (issueDropSlug === group.slug) setIssueDropSlug(null);
                }}
                onDragOver={(event) => {
                  if (canReceiveIssues && event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setIssueDropSlug(group.slug);
                    return;
                  }
                  if (!canMove || !draggedSlug || draggedSlug === group.slug ||
                      !event.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const position = event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
                  setDropTarget((current) =>
                    current?.slug === group.slug && current.position === position
                      ? current
                      : { slug: group.slug as string, position },
                  );
                }}
                onDragStart={(event) => {
                  if (!canMove || !group.slug) return;
                  event.dataTransfer.setData(PROJECT_DRAG_TYPE, group.slug);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedSlug(group.slug);
                  setIssueDropSlug(null);
                }}
                onDrop={(event) => {
                  if (canReceiveIssues && group.slug && event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) {
                    event.preventDefault();
                    setIssueDropSlug(null);
                    const ids = parseIssueDragIds(event.dataTransfer.getData(ISSUE_DRAG_TYPE));
                    if (ids.length) {
                      onDropIssuesToProject(ids, group.slug);
                      setActiveKey(key);
                    }
                    return;
                  }
                  if (!canMove || !group.slug || !draggedSlug || draggedSlug === group.slug) return;
                  event.preventDefault();
                  if (event.dataTransfer.getData(PROJECT_DRAG_TYPE) !== draggedSlug) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onMoveProject(
                    draggedSlug,
                    group.slug,
                    event.clientX < bounds.left + bounds.width / 2 ? "before" : "after",
                  );
                  setDraggedSlug(null);
                  setDropTarget(null);
                }}
                onKeyDown={(event) => {
                  if (canMove && event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
                    event.preventDefault();
                    const from = movable.findIndex((entry) => entry.slug === group.slug);
                    const neighbour = movable[from + (event.key === "ArrowLeft" ? -1 : 1)];
                    if (neighbour?.slug && group.slug) {
                      onMoveProject(group.slug, neighbour.slug, event.key === "ArrowLeft" ? "before" : "after");
                    }
                    return;
                  }
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                    return;
                  }
                  event.preventDefault();
                  const next = tabIndexAfterKey(index, event.key);
                  const nextGroup = groups[next];
                  if (!nextGroup) return;
                  setActiveKey(issueGroupTabKey(nextGroup));
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [next]?.focus();
                }}
                role="tab"
                style={
                  dropTarget?.slug === group.slug
                    ? { boxShadow: dropTarget.position === "before"
                      ? "inset 3px 0 var(--bi-accent)"
                      : "inset -3px 0 var(--bi-accent)" }
                    : undefined
                }
                tabIndex={selected ? 0 : -1}
                title={canMove ? `${group.title} 드래그 또는 Alt+방향키로 순서 변경` : group.title}
                type="button"
              >
                {group.title}
                <span className="ml-1 text-[11px] font-normal text-[var(--bi-muted)]">
                  {group.issues.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        aria-labelledby={`${tabId}-${groups.indexOf(selectedGroup)}-tab`}
        className="flex min-h-0 flex-1 flex-col"
        id={`${tabId}-panel`}
        role="tabpanel"
      >
        <ProjectIssues
          group={selectedGroup}
          key={selectedKey}
          onAdd={onAdd}
          onRemove={onRemove}
          onRemoveProject={onRemoveProject}
          onRename={onRename}
          onSendToToday={onSendToToday}
        />
      </div>
    </div>
  );
}

function ProjectIssues({
  group,
  onAdd,
  onRemove,
  onRemoveProject,
  onRename,
  onSendToToday,
}: {
  group: IssueGroup;
} & Pick<
  IssuePoolProps,
  | "onAdd"
  | "onRemove"
  | "onRemoveProject"
  | "onRename"
  | "onSendToToday"
>) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const allSelected =
    group.issues.length > 0 && group.issues.every((issue) => selectedIds.has(issue.id));

  useEffect(() => {
    const currentIds = new Set(group.issues.map((issue) => issue.id));
    setSelectedIds((previous) => {
      const remaining = [...previous].filter((id) => currentIds.has(id));
      return remaining.length === previous.size ? previous : new Set(remaining);
    });
  }, [group.issues]);

  const toggleSelected = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    if (!group.slug || !draft.trim()) return;
    onAdd(group.slug, draft);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between px-1">
        <button
          aria-label={`${group.title} 할 일 ${allSelected ? "전체선택 해제" : "전체선택"}`}
          aria-pressed={allSelected}
          className="rounded-[3px] text-[11px] font-medium text-[var(--bi-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bi-accent)] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={group.issues.length === 0}
          onClick={() =>
            setSelectedIds(allSelected ? new Set() : new Set(group.issues.map((issue) => issue.id)))
          }
          type="button"
        >
          {allSelected ? "전체해제" : "전체선택"}
        </button>
        {group.removable ? (
          <Button
            aria-label={`${group.title} 프로젝트 삭제`}
            onClick={() => onRemoveProject(group)}
            size="icon-sm"
            title="프로젝트 삭제"
            variant="danger-ghost"
          >
            <HiOutlineTrash aria-hidden size={14} />
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {group.issues.length === 0 ? (
          <li className="px-3 py-8 text-center text-[11px] text-[var(--bi-muted)]">
            쌓인 이슈가 없습니다.
          </li>
        ) : (
          group.issues.map((issue) => (
            <li
              className={`flex items-center gap-2 border-b border-[var(--bi-border)] px-3 py-2 last:border-b-0 data-[grabbable=true]:cursor-grab data-[grabbable=true]:active:cursor-grabbing ${
                selectedIds.has(issue.id)
                  ? "bg-blue-100 hover:bg-blue-200"
                  : "hover:bg-blue-50"
              }`}
              data-grabbable={editingId !== issue.id}
              draggable={editingId !== issue.id}
              key={issue.id}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, input")) return;
                toggleSelected(issue.id);
              }}
              onDragStart={(event) => {
                event.stopPropagation();
                const ids = selectedIds.has(issue.id)
                  ? group.issues.filter((item) => selectedIds.has(item.id)).map((item) => item.id)
                  : [issue.id];
                event.dataTransfer.setData(ISSUE_DRAG_TYPE, JSON.stringify(ids));
                event.dataTransfer.setData("text/plain", ids.length === 1 ? issue.title : `${ids.length}개 할 일`);
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
                <button
                  aria-label={`${issue.title} 선택`}
                  aria-pressed={selectedIds.has(issue.id)}
                  className="min-w-0 flex-1 cursor-pointer truncate rounded-[3px] text-left text-[12px] text-[var(--bi-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bi-accent)]"
                  onClick={() => toggleSelected(issue.id)}
                  title={issue.title}
                  type="button"
                >
                  {issue.title}
                </button>
              </InlineEdit>
              <Button
                aria-label={`${issue.title} 오늘의 할 일로 보내기`}
                onClick={() => onSendToToday(issue)}
                size="icon-sm"
                title="오늘의 할 일로"
                variant="subtle"
              >
                <HiOutlineArrowLeft aria-hidden size={15} />
              </Button>
              <EditButton
                label={`${issue.title} 수정`}
                onClick={() => setEditingId(issue.id)}
              />
              <Button
                aria-label={`${issue.title} 삭제`}
                onClick={() => onRemove(issue)}
                size="icon-sm"
                title="삭제"
                variant="danger-ghost"
              >
                <HiOutlineTrash aria-hidden size={15} />
              </Button>
            </li>
          ))
        )}
      </ul>

      {group.canAdd && group.slug ? (
        <form
          className="flex shrink-0 items-center gap-2 border-t border-[var(--bi-border)] px-3 py-2"
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
          <Button disabled={!draft.trim()} size="sm" type="submit" variant="secondary">
            <HiOutlinePlus aria-hidden size={14} />
            추가
          </Button>
        </form>
      ) : null}
      </div>
    </div>
  );
}
