import { createHash } from 'node:crypto';
import { CollectionError, SOURCES, isJobUrl, sourceUrl } from './config.mjs';

export const IDENTITY_VERSION = 'origin-url-v1';

export function recognizedJobUrl(input) {
  for (const source of Object.keys(SOURCES)) {
    try { if (isJobUrl(source, input)) return listingIdentity(source, input); } catch { /* 다른 수집원의 주소일 수 있다. */ }
  }
  return null;
}

export function jobIdentityKeys(job) {
  const own = listingIdentity(job.source, job.url).exclusionKey;
  return [...new Set([own, ...(Array.isArray(job.originUrls) ? job.originUrls.slice(0,10) : [])
    .map(url => recognizedJobUrl(url)?.exclusionKey).filter(Boolean)])].sort();
}

// 제목/회사명 유사성만으로 합치지 않는다. 확인된 원문 주소의 연결만 사용한다.
export function groupDuplicateJobs(jobs, { allPositions = false } = {}) {
  const parent = jobs.map((_, index) => index), owners = new Map();
  const root = index => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  jobs.forEach((job, index) => {
    if (!allPositions && job.positionCount > 1) return;
    for (const key of jobIdentityKeys(job)) {
      if (owners.has(key)) parent[root(index)] = root(owners.get(key));
      else owners.set(key, index);
    }
  });
  const groups = new Map();
  jobs.forEach((job,index) => {
    const key = root(index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  });
  return [...groups.values()].map(([job,...duplicates]) => ({...job, duplicates}));
}

// 직무 이름/본문/추출 방식이 바뀌어도 같은 원문은 다시 등록하지 않는다.
export function listingIdentity(source, input) {
  const url = sourceUrl(source, input);
  if (!isJobUrl(source, url)) throw new CollectionError('INVALID_JOB');
  const hash = createHash('sha256').update(`${source}\n${url}`).digest('hex');
  return { source, url, exclusionKey: `recruitment:job-exclusion:${hash}` };
}

export function validateJobId(id) {
  if (typeof id !== 'string' || !/^[a-f\d]{64}$/.test(id)) throw new CollectionError('INVALID_JOB');
  return id;
}
