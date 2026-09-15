export type MeetingContent = {
  kind: 'meeting';
  date: string;
  participants: string[];
  summary: string;
  discussions: { title: string; text: string }[];
  decisions: string[];
  actionItems: { task: string; owner: string | null; dueDate: string | null }[];
  transcript?: string;
};

export type MeetingSummary = { slug: string; title: string; date: string; participants: string[] };

export function meetingsHref(project: string, meeting?: string): string {
  const base = `/flows/${encodeURIComponent(project)}/meetings`;
  return meeting === undefined ? base : `${base}/${encodeURIComponent(meeting)}`;
}

export function validateMeetingContent(value: Record<string, unknown>): void {
  const fail = (): never => { throw new Error('회의록 형식이 올바르지 않습니다.'); };
  const text = (v: unknown): v is string => typeof v === 'string';
  const texts = (v: unknown) => Array.isArray(v) && v.every(text);
  const date = (v: unknown) => text(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  const rows = (v: unknown): Record<string, unknown>[] => {
    if (!Array.isArray(v) || !v.every(r => r && typeof r === 'object' && !Array.isArray(r))) fail();
    return v as Record<string, unknown>[];
  };
  if (!date(value.date) || !texts(value.participants) || !text(value.summary) || !texts(value.decisions)) fail();
  for (const row of rows(value.discussions)) if (!text(row.title) || !text(row.text)) fail();
  for (const row of rows(value.actionItems)) {
    if (!text(row.task) || !row.task.trim() || !(row.owner === null || text(row.owner)) ||
      !(row.dueDate === null || date(row.dueDate))) fail();
  }
  if (value.transcript !== undefined && !text(value.transcript)) fail();
}
