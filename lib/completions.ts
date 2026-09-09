/* -------------------------------------------------------------------------
 * 완료 이력 타입과 날짜별 묶기.
 *
 * 프로젝트별로 묶는 순서와 미분류 처리는 오늘의 할 일 화면과 같아야 하므로
 * `groupIssuesByProject` 를 그대로 쓴다.
 * ---------------------------------------------------------------------- */

// lib 안에서는 상대 경로로 가져온다. `@/` 별칭은 tsconfig 만 아는 것이라
// `node --test` 가 .ts 를 직접 읽을 때 값 import 를 해석하지 못한다.
import {
  groupIssuesByProject,
  type CustomProject,
  type Issue,
  type IssueGroup,
} from "./today-board.ts";

export type Completion = {
  id: string;
  projectSlug: string;
  title: string;
  /** 완료한 날. 로컬 기준 YYYY-MM-DD. */
  completedOn: string;
  /** ISO 문자열. */
  completedAt: string;
};

export type CompletionDay = {
  date: string;
  /** 항목이 하나도 없는 그룹은 들어있지 않다. */
  groups: IssueGroup[];
};

function toIssue(completion: Completion): Issue {
  return {
    id: completion.id,
    projectSlug: completion.projectSlug,
    title: completion.title,
    createdAt: completion.completedAt,
  };
}

/** 날짜 내림차순. 완료가 없는 날짜는 아예 나오지 않는다. */
export function groupCompletionsByDate(
  completions: Completion[],
  registryProjects: { slug: string; title: string }[],
  customProjects: CustomProject[] = [],
  projectOrder: string[] = [],
): CompletionDay[] {
  const byDate = new Map<string, Completion[]>();
  for (const completion of completions) {
    const bucket = byDate.get(completion.completedOn);
    if (bucket) bucket.push(completion);
    else byDate.set(completion.completedOn, [completion]);
  }

  return [...byDate.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((date) => ({
      date,
      groups: groupIssuesByProject(
        (byDate.get(date) ?? []).map(toIssue),
        registryProjects,
        customProjects,
        projectOrder,
      ).filter((group) => group.issues.length > 0),
    }));
}
