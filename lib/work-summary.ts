import { PERSONAL_ISSUES_SLUG } from "./today-board.ts";

/** 작업 정리는 완료 기록, Git, AI 대화 근거를 참조하는 날짜별 스냅샷이다. */
export type WorkProject = { key: string; title: string; repositories?: import("./project-registry.ts").RepositoryLink[] };
export type WorkSource = {
  id: string;
  kind: "git" | "completion" | "ai";
  projectKey: string;
  title: string;
  repository?: string;
  commit?: string;
  authorEmail?: string;
  authoredAt?: string;
  committedAt?: string;
  merge?: boolean;
  completionId?: string;
  completedAt?: string;
  sessionId?: string;
  messageId?: string;
  aiSource?: "CODEX" | "CLAUDE_CODE";
  role?: "USER" | "ASSISTANT";
  cwd?: string;
  occurredAt?: string;
  bodyAvailable?: boolean;
};
export type WorkRepository = {
  path: string;
  status: "ok" | "skipped" | "error";
  authorEmails: string[];
  reason?: string;
  projectKey?: string;
};
export type WorkEvidence = {
  version: 1;
  date: string;
  timezone: "Asia/Seoul";
  collectedAt: string;
  expectedRevision: number;
  target: "shared" | "test";
  projects: WorkProject[];
  repositories: WorkRepository[];
  sources: WorkSource[];
  ai?: {
    messages: number;
    sessions: number;
    missingBodies: number;
    devices: { name: string; lastSyncAt: string; errors: number }[];
  };
};
export type WorkSummaryDraft = {
  items: { projectKey: string; title: string; sourceIds: string[] }[];
  excluded: { sourceId: string; reason: string }[];
};
export type WorkSummary = {
  version: 1;
  revision: number;
  savedAt: string;
  evidence: WorkEvidence;
  summary: WorkSummaryDraft;
};
export class WorkSummaryError extends Error {}
export function validWorkDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WorkSummaryError("JSON 객체가 필요합니다.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 2000): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new WorkSummaryError("필수 문자열이 비어 있거나 너무 깁니다.");
}
function array(value: unknown, max = 20000): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new WorkSummaryError("목록 형식 또는 크기가 잘못되었습니다.");
}
function instant(value: unknown) {
  string(value, 100);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new WorkSummaryError("시간 형식이 잘못되었습니다.");
}
export function parseEvidence(input: unknown): WorkEvidence {
  const v = object(input);
  if (
    v.version !== 1 ||
    !validWorkDate(v.date) ||
    v.timezone !== "Asia/Seoul" ||
    !["shared", "test"].includes(String(v.target)) ||
    !Number.isSafeInteger(v.expectedRevision) ||
    Number(v.expectedRevision) < 0
  )
    throw new WorkSummaryError("수집 날짜·대상·버전이 잘못되었습니다.");
  instant(v.collectedAt);
  array(v.projects);
  array(v.sources);
  array(v.repositories);
  const keys = new Set<string>();
  for (const p of v.projects) {
    const project = object(p);
    string(project.key);
    string(project.title);
    if (keys.has(project.key))
      throw new WorkSummaryError("프로젝트가 중복되었습니다.");
    keys.add(project.key);
  }
  for (const r of v.repositories) {
    const repo = object(r);
    string(repo.path);
    if (!["ok", "skipped", "error"].includes(String(repo.status)))
      throw new WorkSummaryError("저장소 상태가 잘못되었습니다.");
    array(repo.authorEmails);
    repo.authorEmails.forEach((x) => string(x));
    if (repo.reason !== undefined) string(repo.reason);
    if (repo.projectKey !== undefined && !keys.has(String(repo.projectKey)))
      throw new WorkSummaryError("저장소 프로젝트가 잘못되었습니다.");
  }
  const ids = new Set<string>();
  for (const raw of v.sources) {
    const s = object(raw);
    string(s.id);
    string(s.projectKey);
    string(s.title, 10000);
    if (ids.has(s.id) || !keys.has(s.projectKey))
      throw new WorkSummaryError(
        "증거 ID 중복 또는 알 수 없는 프로젝트입니다.",
      );
    ids.add(s.id);
    if (s.kind === "git") {
      string(s.repository);
      string(s.commit);
      string(s.authorEmail);
      instant(s.authoredAt);
      instant(s.committedAt);
      if (!/^[a-f0-9]{40,64}$/.test(s.commit) || typeof s.merge !== "boolean")
        throw new WorkSummaryError("Git 증거 형식이 잘못되었습니다.");
      const day = new Date(Date.parse(String(s.committedAt)) + 9 * 3600000)
        .toISOString()
        .slice(0, 10);
      if (day !== v.date)
        throw new WorkSummaryError("Git 커밋 날짜가 수집 날짜와 다릅니다.");
    } else if (s.kind === "completion") {
      string(s.completionId);
      instant(s.completedAt);
    } else if (s.kind === "ai") {
      string(s.sessionId);
      string(s.messageId);
      string(s.cwd, 4096);
      instant(s.occurredAt);
      if (
        s.id !== `ai:${s.messageId}` ||
        !["CODEX", "CLAUDE_CODE"].includes(String(s.aiSource)) ||
        !["USER", "ASSISTANT"].includes(String(s.role)) ||
        typeof s.bodyAvailable !== "boolean" ||
        "body" in s
      ) throw new WorkSummaryError("AI 대화 증거 형식이 잘못되었습니다.");
      if (new Date(Date.parse(String(s.occurredAt)) + 9 * 3600000).toISOString().slice(0, 10) !== v.date)
        throw new WorkSummaryError("AI 메시지 날짜가 수집 날짜와 다릅니다.");
    } else throw new WorkSummaryError("증거 종류가 잘못되었습니다.");
  }
  if (v.ai !== undefined) {
    const ai = object(v.ai);
    const messages = v.sources.map(object).filter(s => s.kind === "ai");
    if (ai.messages !== messages.length ||
        ai.sessions !== new Set(messages.map(s => s.sessionId)).size ||
        ai.missingBodies !== messages.filter(s => !s.bodyAvailable).length)
      throw new WorkSummaryError("AI 수집 건수가 증거와 다릅니다.");
    array(ai.devices);
    for (const raw of ai.devices) {
      const device = object(raw);
      string(device.name);
      instant(device.lastSyncAt);
      if (!Number.isSafeInteger(device.errors) || Number(device.errors) < 0)
        throw new WorkSummaryError("AI 기기 오류 건수가 잘못되었습니다.");
    }
  }
  return input as WorkEvidence;
}
export function parseSummaryDraft(
  input: unknown,
  evidence: WorkEvidence,
): WorkSummaryDraft {
  const v = object(input);
  array(v.items);
  array(v.excluded);
  const sources = new Map(evidence.sources.map((s) => [s.id, s]));
  const used = new Set<string>();
  const use = (id: unknown, projectKey?: string) => {
    string(id);
    const source = sources.get(id);
    if (!source || used.has(id))
      throw new WorkSummaryError("없는 증거 또는 중복 사용한 증거입니다.");
    if (projectKey && source.projectKey !== projectKey)
      throw new WorkSummaryError("다른 프로젝트의 작업을 합칠 수 없습니다.");
    used.add(id);
  };
  for (const raw of v.items) {
    const item = object(raw);
    string(item.projectKey);
    string(item.title, 500);
    array(item.sourceIds);
    if (!item.sourceIds.length)
      throw new WorkSummaryError("작업에는 증거가 필요합니다.");
    item.sourceIds.forEach((id) => use(id, item.projectKey as string));
  }
  for (const raw of v.excluded) {
    const item = object(raw);
    string(item.reason, 500);
    use(item.sourceId);
  }
  if (used.size !== sources.size)
    throw new WorkSummaryError(
      "모든 증거를 작업 또는 제외 사유에 한 번씩 배정하세요.",
    );
  return {
    items: v.items.map((raw) => {
      const x = object(raw);
      return {
        projectKey: x.projectKey as string,
        title: x.title as string,
        sourceIds: x.sourceIds as string[],
      };
    }),
    excluded: v.excluded.map((raw) => {
      const x = object(raw);
      return { sourceId: x.sourceId as string, reason: x.reason as string };
    }),
  };
}
export function parseWorkSummary(input: unknown): WorkSummary {
  const v = object(input);
  if (
    v.version !== 1 ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 1
  )
    throw new WorkSummaryError("저장 버전이 잘못되었습니다.");
  instant(v.savedAt);
  const evidence = parseEvidence(v.evidence);
  const summary = parseSummaryDraft(v.summary, evidence);
  return {
    version: 1,
    revision: v.revision as number,
    savedAt: v.savedAt as string,
    evidence,
    summary,
  };
}
export function groupWorkSummary(report: WorkSummary) {
  const groups = new Map<
    string,
    { key: string; title: string; items: WorkSummaryDraft["items"] }
  >();
  for (const item of report.summary.items) {
    if (!groups.has(item.projectKey))
      groups.set(item.projectKey, {
        key: item.projectKey,
        title:
          report.evidence.projects.find((p) => p.key === item.projectKey)
            ?.title ?? item.projectKey,
        items: [],
      });
    groups.get(item.projectKey)!.items.push(item);
  }
  return [...groups.values()];
}
export function formatWorkSummary(report: WorkSummary): string {
  const groups = groupWorkSummary(report).filter(
    (group) => group.key !== `app:${PERSONAL_ISSUES_SLUG}`,
  );
  if (!groups.length) return "";
  const [, month, day] = report.evidence.date.split("-");
  const lines = [`${month}/${day} 작업내용`];
  for (const group of groups) {
    lines.push(`\`${group.title}\``);
    for (const item of group.items) lines.push(`- ${item.title}`);
  }
  return lines.join("\n");
}
