export type RecruitmentKind = 'EXPERIENCE' | 'COVER_LETTER';
export type RecruitmentScope = 'COMPANY' | 'PERSONAL' | 'GENERAL';
export type RecruitmentDocumentInput = {
  kind: RecruitmentKind;
  title: string;
  project: string;
  scope: RecruitmentScope;
  summary: string;
  tags: string[];
  sections: { title: string; body: string }[];
  sourceUrls: string[];
};
export type RecruitmentDocument = RecruitmentDocumentInput & { id: string; revision: number; updatedAt: string };
export type RecruitmentSummary = Omit<RecruitmentDocument, 'sections' | 'sourceUrls'>;
export class RecruitmentError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function recruitmentKey(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new RecruitmentError('문서 ID를 확인하세요.');
  return `recruitment:document:${id}`;
}
export function parseRecruitmentDocument(value: unknown): RecruitmentDocumentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RecruitmentError('문서 내용을 확인하세요.');
  const row = value as Record<string, unknown>;
  const string = (value: unknown, name: string, max: number, required = false) => {
    if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new RecruitmentError(`${name} 내용을 확인하세요. (최대 ${max.toLocaleString()}자)`);
    return value;
  };
  if (!['EXPERIENCE', 'COVER_LETTER'].includes(String(row.kind))) throw new RecruitmentError('문서 종류를 확인하세요.');
  if (!['COMPANY', 'PERSONAL', 'GENERAL'].includes(String(row.scope))) throw new RecruitmentError('프로젝트 구분을 확인하세요.');
  if (!Array.isArray(row.tags) || row.tags.length > 20) throw new RecruitmentError('태그는 20개까지 입력할 수 있습니다.');
  if (!Array.isArray(row.sections) || !row.sections.length || row.sections.length > 30) throw new RecruitmentError('내용 항목은 1~30개여야 합니다.');
  if (!Array.isArray(row.sourceUrls) || row.sourceUrls.length > 20) throw new RecruitmentError('출처 링크는 20개까지 입력할 수 있습니다.');
  const doc: RecruitmentDocumentInput = {
    kind: row.kind as RecruitmentKind, scope: row.scope as RecruitmentScope,
    title: string(row.title, '제목', 200, true).trim(), project: string(row.project, '프로젝트·지원 회사', 200).trim(),
    summary: string(row.summary, '요약', 2000),
    tags: [...new Set(row.tags.map(tag => string(tag, '태그', 50).trim()).filter(Boolean))],
    sections: row.sections.map(section => {
      if (!section || typeof section !== 'object') throw new RecruitmentError('내용 항목을 확인하세요.');
      return { title: string(section.title, '항목 제목', 100, true), body: string(section.body, '본문', 80_000) };
    }),
    sourceUrls: row.sourceUrls.filter(source => source !== '').map(source => {
      const url = string(source, '출처 링크', 2000, true);
      try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error(); }
      catch { throw new RecruitmentError('출처는 http 또는 https 링크로 입력하세요.'); }
      return url;
    }),
  };
  if (JSON.stringify(doc).length > 90_000) throw new RecruitmentError('문서는 총 90,000자까지 저장할 수 있습니다.', 413);
  return doc;
}
export function recruitmentText(doc: RecruitmentDocumentInput): string {
  return [doc.title, doc.project, doc.summary, ...doc.sections.map(section => `${section.title}\n${section.body}`), ...doc.sourceUrls].filter(Boolean).join('\n\n');
}
