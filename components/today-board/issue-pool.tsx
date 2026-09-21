"use client";

import { useId, useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi";
import { EditButton, InlineEdit } from "@/components/inline-edit";
import { Button } from "@/components/erp/button";
import {
  ISSUE_DRAG_TYPE,
  PERSONAL_ISSUES_SLUG,
  issueGroupTabKey,
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
  onStepProject: (slug: string, delta: -1 | 1) => void;
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
  onStepProject,
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
          onStepProject={onStepProject}
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
          onStepProject={onStepProject}
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
  onStepProject,
}: { groups: IssueGroup[]; label: string } & Omit<
  IssuePoolProps,
  "groups" | "personalGroups"
>) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const tabId = useId();
  const selectedGroup = selectIssueGroup(groups, activeKey);
  const selectedKey = selectedGroup ? issueGroupTabKey(selectedGroup) : null;
  const movable = groups.filter(
    (group) => group.slug !== null && group.slug !== PERSONAL_ISSUES_SLUG,
  );
  const selectedIndex = selectedGroup
    ? movable.findIndex((group) => group.slug === selectedGroup.slug)
    : -1;

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
      <div className="-mx-1 shrink-0 overflow-x-auto px-1 pb-1">
        <div aria-label={label} className="flex min-w-max items-stretch gap-5" role="tablist">
          {groups.map((group, index) => {
            const key = issueGroupTabKey(group);
            const selected = key === selectedKey;
            return (
              <button
                aria-controls={`${tabId}-panel`}
                aria-selected={selected}
                className={`shrink-0 border-b-2 px-0.5 pb-1 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bi-accent)] ${
                  selected
                    ? "border-[var(--bi-accent)] font-semibold text-[var(--bi-accent)]"
                    : "border-transparent font-medium text-[var(--bi-muted)] hover:text-[var(--bi-fg)]"
                }`}
                id={`${tabId}-${index}-tab`}
                key={key}
                onClick={() => setActiveKey(key)}
                onKeyDown={(event) => {
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
                tabIndex={selected ? 0 : -1}
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
          isFirst={selectedIndex <= 0}
          isLast={selectedIndex === -1 || selectedIndex === movable.length - 1}
          key={selectedKey}
          onAdd={onAdd}
          onRemove={onRemove}
          onRemoveProject={onRemoveProject}
          onRename={onRename}
          onSendToToday={onSendToToday}
          onStepProject={onStepProject}
        />
      </div>
    </div>
  );
}

function ProjectIssues({
  group,
  isFirst,
  isLast,
  onAdd,
  onRemove,
  onRemoveProject,
  onRename,
  onSendToToday,
  onStepProject,
}: {
  group: IssueGroup;
  isFirst: boolean;
  isLast: boolean;
} & Pick<
  IssuePoolProps,
  | "onAdd"
  | "onRemove"
  | "onRemoveProject"
  | "onRename"
  | "onSendToToday"
  | "onStepProject"
>) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const movable = group.slug !== null && group.slug !== PERSONAL_ISSUES_SLUG;

  const submit = () => {
    if (!group.slug || !draft.trim()) return;
    onAdd(group.slug, draft);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--bi-border)] bg-[var(--bi-table-header)] px-3 py-2">
        <span className="min-w-0 truncate text-[12px] font-semibold text-[var(--bi-fg)]">
          {group.title}
        </span>
        <span className="shrink-0 text-[11px] text-[var(--bi-muted)]">
          {group.issues.length}건
        </span>
        {movable && group.slug ? (
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <Button
              aria-label={`${group.title} 위로 옮기기`}
              disabled={isFirst}
              onClick={() => onStepProject(group.slug as string, -1)}
              size="icon-sm"
              title="위로 옮기기"
              variant="ghost"
            >
              <HiOutlineChevronUp aria-hidden size={13} />
            </Button>
            <Button
              aria-label={`${group.title} 아래로 옮기기`}
              disabled={isLast}
              onClick={() => onStepProject(group.slug as string, 1)}
              size="icon-sm"
              title="아래로 옮기기"
              variant="ghost"
            >
              <HiOutlineChevronDown aria-hidden size={13} />
            </Button>
          </span>
        ) : null}
        {group.removable ? (
          <Button
            aria-label={`${group.title} 프로젝트 삭제`}
            className={movable ? "" : "ml-auto"}
            onClick={() => onRemoveProject(group)}
            size="icon-sm"
            title="프로젝트 삭제"
            variant="danger-ghost"
          >
            <HiOutlineTrash aria-hidden size={14} />
          </Button>
        ) : null}
      </div>

      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {group.issues.length === 0 ? (
          <li className="px-3 py-8 text-center text-[11px] text-[var(--bi-muted)]">
            쌓인 이슈가 없습니다.
          </li>
        ) : (
          group.issues.map((issue) => (
            <li
              className="flex items-center gap-2 border-b border-[var(--bi-border)] px-3 py-2 last:border-b-0 data-[grabbable=true]:cursor-grab data-[grabbable=true]:active:cursor-grabbing"
              data-grabbable={editingId !== issue.id}
              draggable={editingId !== issue.id}
              key={issue.id}
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.setData(ISSUE_DRAG_TYPE, issue.id);
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
  );
}
