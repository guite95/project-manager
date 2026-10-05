import { RecruitmentError } from './recruitment.ts';

export const jobSources = { saramin: '사람인', jobkorea: '잡코리아', wanted: '원티드', zighang: '직행', jasoseol: '자소설닷컴' } as const;
export const sourceReasons: Record<string,string> = {HTTP_403:'사이트 접근 제한',TERMS_PERMISSION_REQUIRED:'수집·저장 이용 허가 대기',NOT_CONFIGURED:'연결 설정 대기',DEFERRED:'수집 보류'};
export const jobStatuses = { OPEN: '모집 중', CLOSED: '마감', UNKNOWN: '마감 미확인' } as const;
export type JobSummary = {
  id: string; source: keyof typeof jobSources; url: string; title: string; company: string | null;
  locations: string[]; employmentType: string[]; experience: string | null; education: string | null;
  postedAt: string | null; deadline: string | null; status: keyof typeof jobStatuses;
  detailStatus: 'AVAILABLE' | 'MISSING' | 'UNVERIFIED';
  firstSeenAt: string; lastSeenAt: string; updatedAt: string;
  duplicates?: { id: string; source: keyof typeof jobSources; url: string }[];
};
export type JobDetail = JobSummary & { description: string };
export type JobPage = { items: JobSummary[]; total: number; limit: number; offset: number };

export const collectionStates = { QUEUED: '실행 대기', RUNNING: '수집 중', SUCCESS: '완료', PARTIAL: '일부 수집', FAILED: '실패' } as const;
export type CollectionReport = {
  source: keyof typeof jobSources; state: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'DISABLED';
  stored?: number; excluded?: number; errorCount?: number; error?: string; reason?: string;
  limited?: boolean; errors?: {code: string}[]; warnings?: {code: string}[];
};
export function collectionReportReason(report: CollectionReport): string | null {
  const code = report.error ?? report.errors?.[0]?.code;
  if (code === 'HTTP_403' || code === 'ROBOTS_HTTP_403') return '사이트 접근 제한 (403)';
  if (code === 'HTTP_429' || code === 'ROBOTS_HTTP_429') return '사이트 요청 한도 초과';
  if (code === 'ROBOTS_DISALLOWED') return '사이트 수집 규칙으로 제한';
  if (code?.startsWith('ROBOTS_')) return '사이트 수집 규칙 확인 실패';
  if (code) return '수집 오류 · 다음 실행에서 재확인 필요';
  const notes = [];
  if (report.limited) notes.push('수집 상한 도달 · 다음 회차에 계속');
  if (report.warnings?.some(item => item.code === 'ROBOTS_HTTP_403_CONTINUED')) notes.push('robots 확인 불가 (403) · 공개 공고 수집');
  return notes.join(' · ') || null;
}
export type ManualCollection = {
  runKey: string; state: keyof typeof collectionStates; requestedAt: string;
  startedAt?: string; finishedAt?: string; reports: CollectionReport[]; error?: string;
};
export type CollectionStatus = { request: ManualCollection | null; workerOnline: boolean; workerSeenAt: string | null;
  sources?: {id:keyof typeof jobSources;enabled:boolean;reason?:string}[] };
export function collectionBusy(request: ManualCollection | null | undefined) {
  return request?.state === 'QUEUED' || request?.state === 'RUNNING';
}

export function parseJobQuery(params: URLSearchParams) {
  const query = (params.get('q') ?? '').trim();
  const source = params.get('source') ?? '';
  const status = params.get('status') ?? '';
  const pageValue = params.get('page') ?? '1';
  if (query.length > 150 || (source && !Object.hasOwn(jobSources, source)) ||
      (status && !Object.hasOwn(jobStatuses, status)) || !/^[1-9]\d{0,6}$/.test(pageValue)) {
    throw new RecruitmentError('검색 조건을 확인해 주세요.');
  }
  return { query, source, status, limit: 30, offset: (Number(pageValue) - 1) * 30 };
}

export function requireJobId(id: string) {
  if (!/^[a-f\d]{64}$/.test(id)) throw new RecruitmentError('공고 ID를 확인해 주세요.');
  return id;
}
