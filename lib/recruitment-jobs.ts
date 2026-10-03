import { RecruitmentError } from './recruitment.ts';

export const jobSources = { saramin: '사람인', jobkorea: '잡코리아', wanted: '원티드', zighang: '직행', jasoseol: '자소설닷컴' } as const;
export const jobStatuses = { OPEN: '모집 중', CLOSED: '마감', UNKNOWN: '마감 미확인' } as const;
export type JobSummary = {
  id: string; source: keyof typeof jobSources; url: string; title: string; company: string | null;
  locations: string[]; employmentType: string[]; experience: string | null; education: string | null;
  postedAt: string | null; deadline: string | null; status: keyof typeof jobStatuses;
  detailStatus: 'AVAILABLE' | 'MISSING' | 'UNVERIFIED';
  firstSeenAt: string; lastSeenAt: string; updatedAt: string;
};
export type JobDetail = JobSummary & { description: string };
export type JobPage = { items: JobSummary[]; total: number; limit: number; offset: number };

export const collectionStates = { QUEUED: '실행 대기', RUNNING: '수집 중', SUCCESS: '완료', PARTIAL: '일부 수집', FAILED: '실패' } as const;
export type CollectionReport = {
  source: keyof typeof jobSources; state: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  stored?: number; excluded?: number; errorCount?: number; error?: string;
};
export type ManualCollection = {
  runKey: string; state: keyof typeof collectionStates; requestedAt: string;
  startedAt?: string; finishedAt?: string; reports: CollectionReport[]; error?: string;
};
export type CollectionStatus = { request: ManualCollection | null; workerOnline: boolean; workerSeenAt: string | null };
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
