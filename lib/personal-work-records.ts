export const PERSONAL_WORK_RECORDS_KEY = "personal:work-records:2026-09-16";

export type WorkCommit = { hash: string; date: string; subject: string };
export type PersonalWorkRecords = {
  schemaVersion: 1;
  asOf: string;
  collectedAt: string;
  author: string;
  scope: string;
  evidenceSha256: string;
  projects: {
    id: string;
    title: string;
    repository: string;
    head: string;
    periodStart: string;
    periodEnd: string;
    commitCount: number;
    mergeCount: number;
    groups: { title: string; summary: string; commits: WorkCommit[] }[];
    latest: WorkCommit[];
  }[];
};

/** 손상된 저장값을 빈 기록으로 숨기지 않는다. */
export function parsePersonalWorkRecords(value: unknown): PersonalWorkRecords {
  const record = value as PersonalWorkRecords | null;
  const text = (value: unknown) => typeof value === "string" && value.length > 0;
  const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const commits = (items: unknown): boolean => Array.isArray(items) && items.every(item =>
    item && hash(item.hash) && date(item.date) && text(item.subject));
  if (!record || record.schemaVersion !== 1 || !date(record.asOf) || !text(record.collectedAt)
    || !text(record.author) || !text(record.scope) || !/^[a-f0-9]{64}$/.test(record.evidenceSha256 ?? "")
    || !Array.isArray(record.projects) || !record.projects.every(project => project
      && text(project.id) && text(project.title) && text(project.repository) && hash(project.head)
      && date(project.periodStart) && date(project.periodEnd)
      && count(project.commitCount) && count(project.mergeCount) && commits(project.latest)
      && Array.isArray(project.groups) && project.groups.every(group => group
        && text(group.title) && text(group.summary) && commits(group.commits)))
    || new Set(record.projects.map(project => project.id)).size !== record.projects.length) {
    throw new Error("개인 작업 기록의 저장 형식이 올바르지 않습니다.");
  }
  return record;
}
