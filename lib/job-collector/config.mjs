export class CollectionError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// 원티드의 비로그인 공고 목록 한 경로 외의 API와 로그인 경로는 수집하지 않는다.
export const SOURCES = Object.freeze({
  saramin: { name: '사람인', hosts: ['www.saramin.co.kr', 'saramin.co.kr'], jobPath: /^\/zf_user\/jobs\/(?:relay\/view|view)(?:\/|$)/ },
  jobkorea: { name: '잡코리아', hosts: ['www.jobkorea.co.kr'], jobPath: /^\/Recruit\/GI_Read\/\d+\/?$/i },
  wanted: { name: '원티드', hosts: ['www.wanted.co.kr'], jobPath: /^\/wd\/\d+\/?$/ },
  zighang: { name: '직행', hosts: ['zighang.com'], jobPath: /^\/recruitment\/[a-f\d-]{36}\/?$/i },
  jasoseol: { name: '자소설닷컴', hosts: ['jasoseol.com'], jobPath: /^\/recruit\/\d+\/?$/ },
});

export function isWantedListUrl(input) {
  const url = new URL(input);
  if (url.origin !== 'https://www.wanted.co.kr' || url.pathname !== '/api/chaos/navigation/v1/results') return false;
  const params = url.searchParams;
  const rules = { country: /^(all|kr)$/, job_group_id: /^(518|507)$/, job_sort: /^job\.latest_order$/, limit: /^20$/, offset: /^(0|[1-9]\d{0,5})$/ };
  return [...params].length === Object.keys(rules).length && Object.entries(rules).every(([key, rule]) => rule.test(params.get(key) ?? '')) && Number(params.get('offset')) % 20 === 0;
}

export function sourceUrl(source, input, base) {
  const spec = SOURCES[source];
  let url;
  try { url = new URL(input, base); } catch { throw new CollectionError('INVALID_URL'); }
  if (!spec || url.protocol !== 'https:' || url.username || url.password || url.port || !spec.hosts.includes(url.hostname)) {
    throw new CollectionError('URL_NOT_ALLOWED');
  }
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { throw new CollectionError('INVALID_URL'); }
  const publicList = source === 'wanted' && isWantedListUrl(url);
  if (/[\\%\x00-\x1f]/.test(path) || /%2f/i.test(url.pathname) ||
      (/\/(api|login|join|users?|account|profile|apply)(\/|$)/i.test(path) && !publicList) ||
      [...url.searchParams.keys()].some(key => /^(access[-_]?key|token|password|authorization)$/i.test(key))) {
    throw new CollectionError('URL_NOT_ALLOWED');
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|logpath$|oem_code$|listno$)/i.test(key)) url.searchParams.delete(key);
  }
  if (spec.jobPath.test(url.pathname)) {
    if (source === 'saramin') {
      const id = url.searchParams.get('rec_idx');
      if (!id || !/^\d+$/.test(id)) throw new CollectionError('INVALID_URL');
      url.hostname = 'www.saramin.co.kr';
      url.pathname = '/zf_user/jobs/relay/view';
      url.search = '';
      url.searchParams.set('rec_idx', id);
    } else url.search = '';
    url.pathname = url.pathname.replace(/\/$/, '');
  }
  url.searchParams.sort();
  return url.href;
}

export function isJobUrl(source, url) {
  try { return SOURCES[source].jobPath.test(new URL(sourceUrl(source, url)).pathname); }
  catch { return false; }
}

function integer(value, fallback, min, max) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new CollectionError('INVALID_CONFIG');
  return result;
}

export function parseConfig(input) {
  if (!input || !Array.isArray(input.sources) || !input.sources.length || input.sources.length > Object.keys(SOURCES).length) throw new CollectionError('INVALID_CONFIG');
  const names = new Set();
  const sources = input.sources.map(item => {
    if (!item || !SOURCES[item.id] || names.has(item.id) || typeof item.enabled !== 'boolean' ||
        !Array.isArray(item.startUrls) || !item.startUrls.length || item.startUrls.length > 10) throw new CollectionError('INVALID_CONFIG');
    names.add(item.id);
    if (item.disabledReason !== undefined && !['HTTP_403', 'TERMS_PERMISSION_REQUIRED', 'NOT_CONFIGURED', 'DEFERRED'].includes(item.disabledReason)) throw new CollectionError('INVALID_CONFIG');
    if (item.allowRobots403 !== undefined && (item.id !== 'wanted' || typeof item.allowRobots403 !== 'boolean')) throw new CollectionError('INVALID_CONFIG');
    return { id: item.id, enabled: item.enabled, startUrls: [...new Set(item.startUrls.map(url => sourceUrl(item.id, url)))],
      ...(item.allowRobots403 === true ? {allowRobots403:true} : {}),
      ...(!item.enabled ? { disabledReason: item.disabledReason ?? 'NOT_CONFIGURED' } : {}) };
  });
  if (!sources.some(source => source.enabled)) throw new CollectionError('NO_ENABLED_SOURCES');
  const keywords = input.keywords ?? [];
  if (!Array.isArray(keywords) || keywords.length > 50 || keywords.some(word => typeof word !== 'string' || !word.trim() || word.length > 60)) {
    throw new CollectionError('INVALID_CONFIG');
  }
  return {
    sources,
    keywords: [...new Set(keywords.map(word => word.trim()))],
    maxPages: integer(input.maxPages, 60, 1, 300),
    maxJobs: integer(input.maxJobs, 50, 1, 300),
    requestIntervalMs: integer(input.requestIntervalMs, 2000, 1000, 30000),
    timeoutMs: integer(input.timeoutMs, 15000, 1000, 30000),
  };
}

export function errorCode(error) {
  return error instanceof CollectionError ? error.code : error?.name === 'AbortError' ? 'ABORTED' : 'COLLECTION_FAILED';
}
