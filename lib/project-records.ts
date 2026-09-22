export const overviewFields = [
  { key: 'purpose', title: '만든 목적', hint: '누구의 어떤 문제를 해결하기 위해 만들었나요?' },
  { key: 'period', title: '기간', hint: '시작·종료 시점, 현재 진행 상태' },
  { key: 'participants', title: '참여 인원', hint: '인원과 역할 구성' },
  { key: 'role', title: '내가 맡은 범위', hint: '직접 담당한 영역과 다른 참여자의 영역을 구분해 주세요.' },
] as const;
export const workFields = [
  { key: 'work', title: '주요 작업', hint: '기능 개발·개선·장애 해결 등 직접 수행한 작업을 적어 주세요.' },
  { key: 'decisions', title: '문제와 판단', hint: '문제 상황, 비교한 대안, 선택 이유를 적어 주세요.' },
  { key: 'results', title: '구현과 결과', hint: '변경 내용, 테스트·배포 여부, 확인된 효과와 남은 한계를 구분해 주세요.' },
  { key: 'evidence', title: '근거', hint: '코드 경로, 커밋·PR 링크, 설계 자료, 검증 기록을 남겨 주세요.' },
] as const;
export type ProjectOverview = Record<typeof overviewFields[number]['key'], string>;
export type ProjectWork = Record<typeof workFields[number]['key'], string> & { id: string; title: string; summary: string };
export type ProjectRecordsInput = { overview: ProjectOverview; works: ProjectWork[] };
export type ProjectRecords = ProjectRecordsInput & { revision: number; updatedAt: string };
export class ProjectRecordsError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function emptyProjectRecords(): ProjectRecords {
  return { overview: { purpose: '', period: '', participants: '', role: '' }, works: [], revision: 0, updatedAt: '' };
}
export function parseProjectRecords(input: unknown): ProjectRecordsInput {
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProjectRecordsError('기록 내용을 확인하세요.');
    return value as Record<string, unknown>;
  };
  const text = (value: unknown, max = 20_000) => {
    if (typeof value !== 'string' || value.length > max) throw new ProjectRecordsError(`항목은 ${max.toLocaleString()}자 이내로 작성해 주세요.`);
    return value;
  };
  const row = object(input), overview = object(row.overview);
  if (!Array.isArray(row.works) || row.works.length > 100) throw new ProjectRecordsError('작업은 100개까지 작성할 수 있습니다.');
  const ids = new Set<string>();
  const parsed = {
    overview: Object.fromEntries(overviewFields.map(({ key }) => [key, text(overview[key])])) as ProjectOverview,
    works: row.works.map(value => {
      const work = object(value), id = text(work.id, 100), title = text(work.title, 200).trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new ProjectRecordsError('작업 식별자가 중복되거나 올바르지 않습니다.');
      if (!title) throw new ProjectRecordsError('작업 제목을 입력해 주세요.');
      ids.add(id);
      return { id, title, summary: text(work.summary, 2000), ...Object.fromEntries(workFields.map(({ key }) => [key, text(work[key])])) } as ProjectWork;
    }),
  };
  if (JSON.stringify(parsed).length > 90_000) throw new ProjectRecordsError('프로젝트 기록은 총 90,000자까지 저장할 수 있습니다.', 413);
  return parsed;
}
