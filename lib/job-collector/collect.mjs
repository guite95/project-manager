import { errorCode, isJobUrl, sourceUrl } from './config.mjs';
import { createHttpClient } from './http.mjs';
import { discoverLinks, matchedKeywords, parseJobPage } from './parse.mjs';

const MAX_PENDING = 10000;
const stopCodes = new Set(['HTTP_401', 'HTTP_403', 'HTTP_429', 'ROBOTS_UNAVAILABLE', 'CRAWL_DELAY_UNSUPPORTED', 'REQUEST_BUDGET', 'ABORTED', 'LEASE_LOST']);

/** 외부 호출과 DB 저장을 분리해 같은 응답으로 재현 가능한 수집 회차를 만든다. */
export async function collectSource(source, config, { pendingUrls = [], http, signal, now = () => new Date(), heartbeat } = {}) {
  const client = http ?? createHttpClient(source.id, config, { signal, heartbeat });
  const queue = [], queued = new Set(), visited = new Set();
  const jobs = new Map(), errors = [];
  let pages = 0, jobPages = 0, parsed = 0, filtered = 0, closed = 0, queueTruncated = false, unsupported = 0;
  const enqueue = url => {
    try {
      url = sourceUrl(source.id, url);
      if (queued.has(url) || visited.has(url)) return;
      if (queue.length >= MAX_PENDING) { queueTruncated = true; return; }
      queue.push(url); queued.add(url);
    } catch { /* 저장된 대기열도 현재 수집원 경계로 다시 검증한다. */ }
  };
  source.startUrls.forEach(enqueue);
  pendingUrls.forEach(enqueue);

  while (queue.length && pages < config.maxPages && jobPages < config.maxJobs) {
    signal?.throwIfAborted();
    const url = queue.shift(); queued.delete(url); visited.add(url);
    pages++;
    try {
      const response = await client.get(url);
      if (isJobUrl(source.id, response.url)) {
        jobPages++;
        const records = parseJobPage(source.id, response.url, response.body, now());
        unsupported = 0;
        for (const job of records) {
          parsed++;
          if (job.status === 'CLOSED') closed++;
          const matches = matchedKeywords(job, config.keywords);
          // 명시적으로 마감된 공고도 저장해야 과거 열린 공고를 갱신할 수 있다.
          if (!config.keywords.length || matches.length || job.status === 'CLOSED') {
            jobs.set(job.id, { ...job, matchedKeywords: matches });
          } else filtered++;
        }
      } else {
        const links = discoverLinks(source.id, response.url, response.body, response.contentType);
        links.urls.forEach(enqueue);
        queueTruncated ||= links.truncated;
        if (!links.urls.length) errors.push({ url, code: 'NO_DISCOVERABLE_LINKS' });
      }
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ABORTED' || code === 'LEASE_LOST') throw error;
      errors.push({ url, code });
      if (code === 'UNSUPPORTED_PAGE') unsupported++;
      if (stopCodes.has(code) || unsupported >= 3) {
        // 다음 회차에서 실패한 URL을 다시 확인하고 이미 수집한 공고는 보존한다.
        queue.unshift(url);
        break;
      }
    }
  }
  const limited = queue.length > 0 || queueTruncated;
  const state = errors.length ? (parsed ? 'PARTIAL' : 'FAILED') : limited ? 'PARTIAL' : 'SUCCESS';
  return {
    jobs: [...jobs.values()], pendingUrls: queue.slice(0, MAX_PENDING),
    report: {
      source: source.id, state, finishedAt: now().toISOString(), pages, jobPages,
      parsed, retained: jobs.size, filtered, closed, requests: client.requests ?? null,
      limited, queueTruncated, pendingCount: queue.length, errorCount: errors.length, errors: errors.slice(0, 30),
    },
  };
}
