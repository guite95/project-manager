/* -------------------------------------------------------------------------
 * 보드 관련 DB 접근. 라우트 핸들러만 이 파일을 부른다.
 *
 * id 와 시각은 전부 호출부가 넘긴다. 테스트가 결정적이어야 하기 때문이다.
 * lib 안에서는 상대 경로에 .ts 확장자를 붙여 가져온다 — `node --test` 가 같은
 * 파일을 그대로 읽어야 하기 때문이다.
 * ---------------------------------------------------------------------- */

import { prisma } from "../db.ts";
import type { ProjectNote } from "../project-notes.ts";
import { planRollover } from "../rollover.ts";
import type {
  CustomProject,
  Issue,
  TodayBoard,
  TodayItem,
} from "../today-board.ts";

export const BOARD_SETTING_KEY = "board";

type Placement = "pool" | "today";

type IssueRow = {
  id: string;
  projectSlug: string;
  title: string;
  createdAt: Date;
  placement: string;
  todayDate: string | null;
  done: boolean;
  position: number;
};

function toIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    projectSlug: row.projectSlug,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTodayItem(row: IssueRow): TodayItem {
  return { ...toIssue(row), done: row.done };
}

function asStrings(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((entry): entry is string => typeof entry === "string")
    : [];
}

async function readSettings(): Promise<{
  projectOrder: string[];
  collapsedProjects: string[];
}> {
  const row = await prisma.appSetting.findUnique({
    where: { key: BOARD_SETTING_KEY },
  });
  const value = (row?.value ?? {}) as {
    projectOrder?: unknown;
    collapsedProjects?: unknown;
  };
  return {
    projectOrder: asStrings(value.projectOrder),
    collapsedProjects: asStrings(value.collapsedProjects),
  };
}

/** 지난 날짜의 오늘 항목을 정리한다. 정리할 게 없으면 쓰기 쿼리를 돌리지 않는다. */
async function runRollover(today: string): Promise<void> {
  const rows = await prisma.issue.findMany({
    where: { placement: "today" },
    select: { id: true, todayDate: true, done: true },
  });

  const plan = planRollover(
    rows.map((row) => ({
      id: row.id,
      todayDate: row.todayDate ?? today,
      done: row.done,
    })),
    today,
  );

  if (!plan.returnToPool.length && !plan.remove.length) return;

  await prisma.$transaction([
    prisma.issue.updateMany({
      where: { id: { in: plan.returnToPool } },
      data: { placement: "pool", todayDate: null, done: false },
    }),
    prisma.issue.deleteMany({ where: { id: { in: plan.remove } } }),
  ]);
}

export async function loadBoard(today: string): Promise<TodayBoard> {
  await runRollover(today);

  const [rows, projects, settings] = await Promise.all([
    prisma.issue.findMany({ orderBy: { position: "asc" } }),
    prisma.customProject.findMany({ orderBy: { createdAt: "asc" } }),
    readSettings(),
  ]);

  return {
    issues: rows.filter((row) => row.placement === "pool").map(toIssue),
    today: rows.filter((row) => row.placement === "today").map(toTodayItem),
    customProjects: projects.map(
      (project): CustomProject => ({
        slug: project.slug,
        title: project.title,
        createdAt: project.createdAt.toISOString(),
      }),
    ),
    projectOrder: settings.projectOrder,
    collapsedProjects: settings.collapsedProjects,
  };
}

/** 목록 맨 뒤 자리를 준다. 목록이 비어 있으면 0. */
async function nextPosition(placement: Placement): Promise<number> {
  const last = await prisma.issue.findFirst({
    where: { placement },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return last ? last.position + 1 : 0;
}

export async function createIssue(input: {
  id: string;
  projectSlug: string;
  title: string;
  now: string;
}): Promise<Issue> {
  const row = await prisma.issue.create({
    data: {
      id: input.id,
      projectSlug: input.projectSlug,
      title: input.title,
      createdAt: new Date(input.now),
      placement: "pool",
      todayDate: null,
      done: false,
      position: await nextPosition("pool"),
    },
  });
  return toIssue(row);
}

/**
 * 제목을 고친다. 빈 제목은 무시하고, 없는 id 는 조용히 넘어간다.
 *
 * 이미 쌓인 완료 이력의 제목은 건드리지 않는다. 이력은 완료한 시점의 기록이고,
 * 원래 이슈를 지워도 남도록 제목을 복사해 두는 구조이기 때문이다.
 */
export async function setIssueTitle(
  id: string,
  title: string,
): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  await prisma.issue.updateMany({ where: { id }, data: { title: trimmed } });
}

export async function deleteIssue(id: string): Promise<void> {
  await prisma.issue.delete({ where: { id } });
}

export async function moveIssue(
  id: string,
  placement: Placement,
  today: string,
): Promise<void> {
  const position = await nextPosition(placement);

  if (placement === "today") {
    await prisma.issue.update({
      where: { id },
      data: { placement, todayDate: today, position },
    });
    return;
  }

  // 풀로 되돌아가면 완료 표시가 의미를 잃는다. 체크를 푼 것과 같게 다뤄
  // 그날 쌓인 이력도 함께 지운다. 그러지 않으면 다시 체크할 때 같은 날짜에
  // 이력이 두 번 남는다.
  await prisma.$transaction([
    prisma.completion.deleteMany({ where: { issueId: id, completedOn: today } }),
    prisma.issue.update({
      where: { id },
      data: { placement, todayDate: null, done: false, position },
    }),
  ]);
}

/**
 * 체크 상태를 바꾸고 완료 이력을 같은 트랜잭션에서 만들거나 지운다.
 * 체크를 풀 때는 그 이슈의 그날 이력만 지운다.
 */
export async function setIssueDone(input: {
  id: string;
  done: boolean;
  completionId: string;
  today: string;
  now: string;
}): Promise<void> {
  const issue = await prisma.issue.findUnique({ where: { id: input.id } });
  if (!issue) return;

  await prisma.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: input.id },
      data: { done: input.done },
    });

    if (input.done) {
      await tx.completion.create({
        data: {
          id: input.completionId,
          issueId: issue.id,
          projectSlug: issue.projectSlug,
          title: issue.title,
          completedOn: input.today,
          completedAt: new Date(input.now),
        },
      });
    } else {
      await tx.completion.deleteMany({
        where: { issueId: issue.id, completedOn: input.today },
      });
    }
  });
}

/** 넘어온 순서대로 0부터 다시 매긴다. 목록에 없는 id 는 무시된다. */
export async function reorderIssues(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.issue.updateMany({ where: { id }, data: { position: index } }),
    ),
  );
}

export async function createCustomProject(input: {
  slug: string;
  title: string;
  now: string;
}): Promise<CustomProject> {
  const row = await prisma.customProject.create({
    data: {
      slug: input.slug,
      title: input.title,
      createdAt: new Date(input.now),
    },
  });
  return {
    slug: row.slug,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 프로젝트만 지운다. 그 프로젝트의 이슈는 손대지 않는다. 화면이 미분류로 묶는다. */
export async function deleteCustomProject(slug: string): Promise<void> {
  await prisma.customProject.delete({ where: { slug } });
}

export async function saveSettings(settings: {
  projectOrder: string[];
  collapsedProjects: string[];
}): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: BOARD_SETTING_KEY },
    create: { key: BOARD_SETTING_KEY, value: settings },
    update: { value: settings },
  });
}

/* ------------------------------------------------------------------ 이관 */

/** 이슈·프로젝트·명심할 점이 모두 없을 때만 비어 있다고 본다. */
export async function isBoardEmpty(): Promise<boolean> {
  const [issues, projects, notes] = await Promise.all([
    prisma.issue.count(),
    prisma.customProject.count(),
    prisma.projectNote.count(),
  ]);
  return issues === 0 && projects === 0 && notes === 0;
}

/**
 * 브라우저에서 올라온 값을 한 트랜잭션에 넣는다. 완료 이력은 저장된 적이 없어
 * 이관 대상이 아니다. 오늘 목록은 넘어온 순서대로 오늘 날짜를 달아 넣는다.
 */
export async function importLegacy(payload: {
  board: TodayBoard | null;
  notes: { projectSlug: string; notes: ProjectNote[] }[];
  today: string;
  now: string;
}): Promise<void> {
  const board = payload.board;

  await prisma.$transaction(async (tx) => {
    if (board) {
      for (const project of board.customProjects) {
        await tx.customProject.create({
          data: {
            slug: project.slug,
            title: project.title,
            createdAt: new Date(project.createdAt || payload.now),
          },
        });
      }

      for (const [index, issue] of board.issues.entries()) {
        await tx.issue.create({
          data: {
            id: issue.id,
            projectSlug: issue.projectSlug,
            title: issue.title,
            createdAt: new Date(issue.createdAt || payload.now),
            placement: "pool",
            todayDate: null,
            done: false,
            position: index,
          },
        });
      }

      for (const [index, item] of board.today.entries()) {
        await tx.issue.create({
          data: {
            id: item.id,
            projectSlug: item.projectSlug,
            title: item.title,
            createdAt: new Date(item.createdAt || payload.now),
            placement: "today",
            todayDate: payload.today,
            done: item.done,
            position: index,
          },
        });
      }

      await tx.appSetting.upsert({
        where: { key: BOARD_SETTING_KEY },
        create: {
          key: BOARD_SETTING_KEY,
          value: {
            projectOrder: board.projectOrder,
            collapsedProjects: board.collapsedProjects,
          },
        },
        update: {
          value: {
            projectOrder: board.projectOrder,
            collapsedProjects: board.collapsedProjects,
          },
        },
      });
    }

    for (const entry of payload.notes) {
      for (const [index, note] of entry.notes.entries()) {
        await tx.projectNote.create({
          data: {
            id: note.id,
            projectSlug: entry.projectSlug,
            content: note.content,
            priority: note.priority,
            position: index,
            updatedAt: new Date(note.updatedAt || payload.now),
          },
        });
      }
    }
  });
}
