"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IssuePool } from "@/components/today-board/issue-pool";
import { TodayList } from "@/components/today-board/today-list";
import { flowProjects } from "@/lib/flows/registry";
import {
  addIssue,
  addProject,
  createBoard,
  groupIssuesByProject,
  isProjectTitleTaken,
  normalizeTodayBoard,
  removeIssue,
  removeProject,
  returnToPool,
  rollOverBoard,
  sendToToday,
  todayDateString,
  toggleDone,
  TODAY_BOARD_STORAGE_KEY,
  type Issue,
  type IssueGroup,
  type TodayBoard,
  type TodayItem,
} from "@/lib/today-board";

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TodayBoardView() {
  // null 은 "아직 저장값을 안 읽음". 서버 렌더와 어긋나지 않도록 첫 렌더에서는
  // 안내만 보여준다.
  const [board, setBoard] = useState<TodayBoard | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const loadedRef = useRef(false);

  // 저장값을 읽고 그 자리에서 날짜 롤오버를 판정한다. 자정을 넘겨 켜둔 탭은
  // 여기서 정리되지 않고 다음에 열 때 정리된다 (타이머로 감시하지 않는다).
  useEffect(() => {
    const today = todayDateString(new Date());
    let next = createBoard(today);
    try {
      const saved = window.localStorage.getItem(TODAY_BOARD_STORAGE_KEY);
      if (saved) {
        next = rollOverBoard(
          normalizeTodayBoard(JSON.parse(saved), today),
          today,
        );
      }
    } catch {
      setStorageError("저장된 내용을 불러오지 못했습니다.");
    }
    setBoard(next);
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!loadedRef.current || !board) return;
    try {
      window.localStorage.setItem(
        TODAY_BOARD_STORAGE_KEY,
        JSON.stringify(board),
      );
      setStorageError(null);
    } catch {
      setStorageError("이 브라우저에 내용을 저장할 수 없습니다.");
    }
  }, [board]);

  const projects = useMemo(
    () => flowProjects.map(({ slug, title }) => ({ slug, title })),
    [],
  );

  const customProjects = board?.customProjects ?? [];

  const projectTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const project of projects) map[project.slug] = project.title;
    for (const project of customProjects) map[project.slug] = project.title;
    return map;
  }, [projects, customProjects]);

  const groups = useMemo(
    () => groupIssuesByProject(board?.issues ?? [], projects, customProjects),
    [board?.issues, projects, customProjects],
  );

  const handleAdd = (projectSlug: string, title: string) => {
    setBoard((current) =>
      current
        ? addIssue(
            current,
            projectSlug,
            title,
            createId("issue"),
            new Date().toISOString(),
          )
        : current,
    );
  };

  const handleAddProject = (title: string) => {
    setBoard((current) =>
      current
        ? addProject(
            current,
            title,
            createId("custom"),
            new Date().toISOString(),
          )
        : current,
    );
    setAnnouncement(`${title.trim()} 프로젝트를 추가했습니다.`);
  };

  const handleRemoveProject = (group: IssueGroup) => {
    if (!group.slug) return;
    const moved = group.issues.length
      ? ` 이슈 ${group.issues.length}건은 미분류로 옮겨집니다.`
      : "";
    if (!window.confirm(`“${group.title}” 프로젝트를 삭제할까요?${moved}`)) {
      return;
    }
    setBoard((current) =>
      current ? removeProject(current, group.slug as string) : current,
    );
    setAnnouncement(`${group.title} 프로젝트를 삭제했습니다.${moved}`);
  };

  const handleRemove = (issue: Issue) => {
    if (!window.confirm(`“${issue.title}” 이슈를 삭제할까요?`)) return;
    setBoard((current) => (current ? removeIssue(current, issue.id) : current));
    setAnnouncement(`${issue.title} 이슈를 삭제했습니다.`);
  };

  const handleSendToToday = (issue: Issue) => {
    setBoard((current) => (current ? sendToToday(current, issue.id) : current));
    setAnnouncement(`${issue.title} 이슈를 오늘의 할 일로 옮겼습니다.`);
  };

  const handleReturn = (item: TodayItem) => {
    setBoard((current) => (current ? returnToPool(current, item.id) : current));
    setAnnouncement(`${item.title} 항목을 이슈 목록으로 되돌렸습니다.`);
  };

  const handleToggle = (item: TodayItem) => {
    setBoard((current) => (current ? toggleDone(current, item.id) : current));
    setAnnouncement(
      item.done
        ? `${item.title} 항목의 완료를 취소했습니다.`
        : `${item.title} 항목을 완료했습니다.`,
    );
  };

  if (!board) {
    return (
      <p className="px-6 py-10 text-center text-[12px] text-[var(--bi-muted)]">
        저장된 내용을 불러오는 중입니다.
      </p>
    );
  }

  // 드롭은 id 만 넘어온다. 안내 문구를 만들려면 현재 보드에서 항목을 찾아야 하는데,
  // setBoard 업데이터는 순수해야 하므로 여기 밖에서 찾는다.
  const handleDropIssue = (issueId: string) => {
    const issue = board.issues.find((item) => item.id === issueId);
    if (!issue) return;
    handleSendToToday(issue);
  };

  return (
    <div className="px-6 py-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <TodayList
          date={board.date}
          items={board.today}
          onDropIssue={handleDropIssue}
          onReturn={handleReturn}
          onToggle={handleToggle}
          projectTitles={projectTitles}
        />
        <IssuePool
          groups={groups}
          isProjectTitleTaken={(title) =>
            isProjectTitleTaken(board, title, projects)
          }
          onAdd={handleAdd}
          onAddProject={handleAddProject}
          onRemove={handleRemove}
          onRemoveProject={handleRemoveProject}
          onSendToToday={handleSendToToday}
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {storageError ? (
        <p
          aria-live="polite"
          className="mt-3 text-[11px] text-[var(--bi-error)]"
        >
          {storageError}
        </p>
      ) : null}
    </div>
  );
}
