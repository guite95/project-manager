import { createHash } from 'node:crypto';
import { CollectionError, isJobUrl, sourceUrl } from './config.mjs';

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
