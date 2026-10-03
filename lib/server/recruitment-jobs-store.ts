import { createCollectionStore } from '../job-collector/store.mjs';
import { requireJobId, type JobDetail, type JobPage, type parseJobQuery } from '../recruitment-jobs.ts';

type Store = ReturnType<typeof createCollectionStore>;
const globalForJobs = globalThis as unknown as { recruitmentJobStore?: Store };
let localStore: Store | undefined;
function store() {
  const cached = globalForJobs.recruitmentJobStore ?? localStore;
  if (cached) return cached;
  localStore = createCollectionStore();
  if (process.env.NODE_ENV !== 'production') globalForJobs.recruitmentJobStore = localStore;
  return localStore;
}

export async function listRecruitmentJobs(query: ReturnType<typeof parseJobQuery>): Promise<JobPage> {
  return store().listPage(query);
}
export async function getRecruitmentJob(id: string): Promise<JobDetail | null> {
  return store().get(requireJobId(id));
}
export async function deleteRecruitmentJob(id: string) {
  return store().remove(requireJobId(id));
}
export async function requestJobCollection() {
  return store().requestManual();
}
export async function getJobCollectionStatus() {
  return store().controlStatus();
}
