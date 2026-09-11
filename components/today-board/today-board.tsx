"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IssuePool } from "@/components/today-board/issue-pool";
import { TodayList } from "@/components/today-board/today-list";
import {
  deleteIssueRequest,
  deleteProjectRequest,
  fetchBoard,
  patchIssue,
  postImport,
  postIssue,
  postProject,
  putSettings,
} from "@/lib/api-client";
import {
  clearLegacyData,
  hasLegacyData,
  readLegacyData,
} from "@/lib/import-legacy";
import {
  formatWorklog,
  groupIssuesByProject,
  isProjectTitleTaken,
  moveProject,
  removeIssue,
  removeProject,
  renameIssue,
  returnToPool,
  sendToToday,
  todayDateString,
  toggleDone,
  toggleProjectCollapsed,
  type Issue,
  type IssueGroup,
  type TodayBoard,
  type TodayItem,
} from "@/lib/today-board";

export function TodayBoardView({ flowProjects }: { flowProjects: {slug:string;title:string}[] }) {
  // null 은 "아직 서버에서 안 받아옴". 서버 렌더와 어긋나지 않도록 첫 렌더에서는
  // 안내만 보여준다.
  const [board, setBoard] = useState<TodayBoard | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // 롤오버는 서버가 보드를 읽을 때 판정한다. 자정을 넘겨 켜둔 탭은 여기서
  // 정리되지 않고 다음에 열 때 정리된다 (타이머로 감시하지 않는다).
  const today = todayDateString(new Date());

  const reload = useCallback(async () => {
    try {
      setBoard(await fetchBoard());
      setStorageError(null);
    } catch {
      setStorageError("서버에서 내용을 불러오지 못했습니다.");
    }
  }, []);

  /** 이관 대상 키를 찾을 때 쓴다. 레지스트리 프로젝트만 명심할 점을 가진다. */
  const projectSlugs = useMemo(
    () => flowProjects.map((project) => project.slug),
    [flowProjects],
  );

  // 첫 로드. 서버가 비어 있을 때만 브라우저에 남은 옛 데이터를 한 번 올린다.
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      let loaded: TodayBoard;
      try {
        loaded = await fetchBoard();
      } catch {
        if (!cancelled) setStorageError("서버에서 내용을 불러오지 못했습니다.");
        return;
      }

      const serverEmpty =
        loaded.issues.length === 0 &&
        loaded.today.length === 0 &&
        loaded.customProjects.length === 0;

      if (serverEmpty) {
        try {
          const payload = readLegacyData(window.localStorage, projectSlugs);
          if (hasLegacyData(payload)) {
            await postImport(payload);
            clearLegacyData(window.localStorage, projectSlugs);
            loaded = await fetchBoard();
          }
        } catch {
          // 이관에 실패해도 앱은 열려야 한다. 브라우저 값은 지우지 않는다.
        }
      }

      if (!cancelled) {
        setBoard(loaded);
        setStorageError(null);
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
  }, [projectSlugs]);

  /**
   * 화면 상태를 먼저 바꾸고 서버에 반영한다. 실패하면 서버 상태를 다시 받아
   * 덮어써서 화면과 서버가 어긋난 채로 남지 않게 한다.
   */
  const sync = useCallback(
    async (call: () => Promise<unknown>) => {
      try {
        await call();
        setStorageError(null);
      } catch {
        setStorageError(
          "서버에 저장하지 못했습니다. 최신 내용을 다시 불러옵니다.",
        );
        await reload();
      }
    },
    [reload],
  );

  const projects = useMemo(
    () => flowProjects.map(({ slug, title }) => ({ slug, title })),
    [flowProjects],
  );

  const customProjects = board?.customProjects ?? [];

  const projectTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const project of projects) map[project.slug] = project.title;
    for (const project of customProjects) map[project.slug] = project.title;
    return map;
  }, [projects, customProjects]);

  const groups = useMemo(
    () =>
      groupIssuesByProject(
        board?.issues ?? [],
        projects,
        customProjects,
        board?.projectOrder ?? [],
      ),
    [board?.issues, board?.projectOrder, projects, customProjects],
  );

  // 미분류는 순서를 바꿀 수 없어 제외한다. moveProject 가 기준으로 삼는 현재 순서다.
  const orderedSlugs = useMemo(
    () =>
      groups
        .map((group) => group.slug)
        .filter((slug): slug is string => slug !== null),
    [groups],
  );

  // 서버가 id 를 만드므로 응답을 받은 뒤 상태에 넣는다.
  const handleAdd = (projectSlug: string, title: string) => {
    void sync(async () => {
      const issue = await postIssue(projectSlug, title);
      setBoard((current) =>
        current ? { ...current, issues: [...current.issues, issue] } : current,
      );
    });
  };

  const handleAddProject = (title: string) => {
    void sync(async () => {
      const project = await postProject(title);
      setBoard((current) =>
        current
          ? { ...current, customProjects: [...current.customProjects, project] }
          : current,
      );
      setAnnouncement(`${title.trim()} 프로젝트를 추가했습니다.`);
    });
  };

  /**
   * `setBoard` 업데이터 안에서 요청을 보내면 안 된다. 업데이터는 순수해야 하고
   * React 가 두 번 부를 수 있다. 다음 상태를 업데이터 밖에서 만든다.
   */
  const handleMoveProject = (
    slug: string,
    targetSlug: string,
    position: "before" | "after",
  ) => {
    if (!board) return;
    const next = moveProject(board, orderedSlugs, slug, targetSlug, position);
    setBoard(next);
    void sync(() =>
      putSettings({
        projectOrder: next.projectOrder,
        collapsedProjects: next.collapsedProjects,
      }),
    );
  };

  /** 위/아래 버튼 — 한 칸 옮기기를 이웃 기준 이동으로 옮겨 적는다. */
  const handleStepProject = (slug: string, delta: -1 | 1) => {
    const from = orderedSlugs.indexOf(slug);
    const neighbour = orderedSlugs[from + delta];
    if (from === -1 || !neighbour) return;
    handleMoveProject(slug, neighbour, delta === -1 ? "before" : "after");
    setAnnouncement(
      `${projectTitles[slug] ?? slug} 프로젝트를 ${
        delta === -1 ? "위로" : "아래로"
      } 옮겼습니다.`,
    );
  };

  const handleRemoveProject = (group: IssueGroup) => {
    if (!group.slug) return;
    const moved = group.issues.length
      ? ` 이슈 ${group.issues.length}건은 미분류로 옮겨집니다.`
      : "";
    if (!window.confirm(`“${group.title}” 프로젝트를 삭제할까요?${moved}`)) {
      return;
    }
    const slug = group.slug;
    setBoard((current) => (current ? removeProject(current, slug) : current));
    setAnnouncement(`${group.title} 프로젝트를 삭제했습니다.${moved}`);
    void sync(() => deleteProjectRequest(slug));
  };

  const handleRemove = (issue: Issue) => {
    if (!window.confirm(`“${issue.title}” 이슈를 삭제할까요?`)) return;
    setBoard((current) => (current ? removeIssue(current, issue.id) : current));
    setAnnouncement(`${issue.title} 이슈를 삭제했습니다.`);
    void sync(() => deleteIssueRequest(issue.id));
  };

  const handleSendToToday = (issue: Issue) => {
    setBoard((current) => (current ? sendToToday(current, issue.id) : current));
    setAnnouncement(`${issue.title} 이슈를 오늘의 할 일로 옮겼습니다.`);
    void sync(() => patchIssue(issue.id, { placement: "today" }));
  };

  const handleReturn = (item: TodayItem) => {
    setBoard((current) => (current ? returnToPool(current, item.id) : current));
    setAnnouncement(`${item.title} 항목을 이슈 목록으로 되돌렸습니다.`);
    void sync(() => patchIssue(item.id, { placement: "pool" }));
  };

  /** 제목만 바꾼다. 풀에 있든 오늘 목록에 있든 같은 경로를 쓴다. */
  const handleRename = (item: Issue, title: string) => {
    setBoard((current) =>
      current ? renameIssue(current, item.id, title) : current,
    );
    setAnnouncement(`${item.title} 항목의 제목을 바꿨습니다.`);
    void sync(() => patchIssue(item.id, { title }));
  };

  const handleToggle = (item: TodayItem) => {
    setBoard((current) => (current ? toggleDone(current, item.id) : current));
    setAnnouncement(
      item.done
        ? `${item.title} 항목의 완료를 취소했습니다.`
        : `${item.title} 항목을 완료했습니다.`,
    );
    void sync(() => patchIssue(item.id, { done: !item.done }));
  };

  if (!board) {
    return (
      <p className="px-6 py-10 text-center text-[12px] text-[var(--bi-muted)]">
        서버에서 내용을 불러오는 중입니다.
      </p>
    );
  }

  const handleToggleCollapsed = (slug: string) => {
    if (!board) return;
    const next = toggleProjectCollapsed(board, slug);
    setBoard(next);
    void sync(() =>
      putSettings({
        projectOrder: next.projectOrder,
        collapsedProjects: next.collapsedProjects,
      }),
    );
  };

  const handleCopyWorklog = async (): Promise<boolean> => {
    const text = formatWorklog(board, projects, today);
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      setAnnouncement("작업내용을 클립보드에 복사했습니다.");
      return true;
    } catch {
      // 권한이 없거나 비보안 컨텍스트면 클립보드 API 가 막힌다.
      setAnnouncement("클립보드에 복사하지 못했습니다.");
      return false;
    }
  };

  // 드롭은 id 만 넘어온다. 안내 문구를 만들려면 현재 보드에서 항목을 찾아야 하는데,
  // setBoard 업데이터는 순수해야 하므로 여기 밖에서 찾는다.
  const handleDropIssue = (issueId: string) => {
    const issue = board.issues.find((item) => item.id === issueId);
    if (!issue) return;
    handleSendToToday(issue);
  };

  return (
    <div className="flex flex-col px-6 py-5 lg:min-h-0 lg:flex-1">
      <div className="grid grid-cols-1 items-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:items-stretch">
        <TodayList
          date={today}
          items={board.today}
          onCopyWorklog={handleCopyWorklog}
          onDropIssue={handleDropIssue}
          onRename={handleRename}
          onReturn={handleReturn}
          onToggle={handleToggle}
          projectTitles={projectTitles}
        />
        <IssuePool
          collapsedSlugs={board.collapsedProjects}
          groups={groups}
          isProjectTitleTaken={(title) =>
            isProjectTitleTaken(board, title, projects)
          }
          onAdd={handleAdd}
          onAddProject={handleAddProject}
          onMoveProject={handleMoveProject}
          onRemove={handleRemove}
          onRemoveProject={handleRemoveProject}
          onRename={handleRename}
          onSendToToday={handleSendToToday}
          onStepProject={handleStepProject}
          onToggleCollapsed={handleToggleCollapsed}
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
