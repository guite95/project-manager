import { validateMeetingContent, type MeetingContent } from '../meetings.ts';
import { validateMaterial, type MaterialContent } from '../materials.ts';

export type ScheduleItem = { id: string; title: string; completed: boolean; startISO: string | null; endISO: string | null };
export type ImportedTable = {
  name: string; module: string; koLabel: string; koDesc: string;
  columns: { name: string; label: string; type: string; isPk: boolean; isFk: boolean; nullable: boolean }[];
};
export type ProjectContent =
  | MaterialContent
  | MeetingContent
  | { kind: "schedule"; title: string; startISO: string; endISO: string; phases: { label: string; subtitle: string; groups: { title: string; items: ScheduleItem[] }[] }[] }
  | { kind: "erd"; tables: ImportedTable[]; relations: { from: string; fromColumn: string; to: string; toColumn: string }[] }
  | { kind: "slides"; styles: string; slides: { title: string; html: string }[] }
  | { kind: "html"; html: string }
  | { kind: "notice"; text: string };

export const contentLabels = { material: "자료", meeting: "회의록", schedule: "일정", erd: "ERD", slides: "발표", html: "HTML", notice: "자료" };

/** 외부 문서는 격리된 프레임에서만 표시하며 네트워크·스크립트·폼 실행을 막는다. */
export function sandboxedDocument(html: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
}

export function validateProjectContent(value: unknown): asserts value is ProjectContent {
  const fail = () => { throw new Error("프로젝트 콘텐츠 형식이 올바르지 않습니다."); };
  const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail();
  const str = (v: unknown) => { if (typeof v !== "string") fail(); };
  const rows = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.map(obj) : fail();
  const c = obj(value);
  if (c.kind === "material") validateMaterial(c);
  else if (c.kind === "meeting") validateMeetingContent(c);
  else if (c.kind === "html") str(c.html);
  else if (c.kind === "notice") str(c.text);
  else if (c.kind === "slides") {
    str(c.styles);
    if (!rows(c.slides).length) fail();
    for (const slide of rows(c.slides)) { str(slide.title); str(slide.html); }
  } else if (c.kind === "schedule") {
    str(c.title); str(c.startISO); str(c.endISO);
    const ids = new Set();
    for (const phase of rows(c.phases)) {
      str(phase.label); str(phase.subtitle);
      for (const group of rows(phase.groups)) {
        str(group.title);
        for (const item of rows(group.items)) {
          str(item.id); str(item.title);
          if (ids.has(item.id) || typeof item.completed !== "boolean") fail();
          ids.add(item.id);
          if (item.startISO !== null) str(item.startISO);
          if (item.endISO !== null) str(item.endISO);
        }
      }
    }
  } else if (c.kind === "erd") {
    const tables = rows(c.tables);
    const names = new Set(tables.map(t => t.name));
    if (names.size !== tables.length) fail();
    for (const t of tables) {
      for (const key of ["name", "module", "koLabel", "koDesc"]) str(t[key]);
      const columns = rows(t.columns);
      if (new Set(columns.map(f => f.name)).size !== columns.length) fail();
      for (const f of columns) {
        str(f.name); str(f.label); str(f.type);
        for (const key of ["isPk", "isFk", "nullable"]) if (typeof f[key] !== "boolean") fail();
      }
    }
    for (const r of rows(c.relations)) {
      for (const key of ["from", "fromColumn", "to", "toColumn"]) str(r[key]);
      if (!tables.some(t => t.name === r.from && rows(t.columns).some(f => f.name === r.fromColumn)) ||
          !tables.some(t => t.name === r.to && rows(t.columns).some(f => f.name === r.toColumn))) fail();
    }
  } else fail();
}
