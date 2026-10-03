export class CollectionError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// 브라우저 내부 API나 로그인 경로는 수집 대상에 포함하지 않는다.
export const SOURCES = Object.freeze({
  saramin: { name: '사람인', hosts: ['www.saramin.co.kr', 'saramin.co.kr'], jobPath: /^\/zf_user\/jobs\/(?:relay\/view|view)(?:\/|$)/ },
  jobkorea: { name: '잡코리아', hosts: ['www.jobkorea.co.kr'], jobPath: /^\/Recruit\/GI_Read\/\d+\/?$/i },
  wanted: { name: '원티드', hosts: ['www.wanted.co.kr'], jobPath: /^\/wd\/\d+\/?$/ },
  zighang: { name: '직행', hosts: ['zighang.com'], jobPath: /^\/recruitment\/[a-f\d-]{36}\/?$/i },
  jasoseol: { name: '자소설닷컴', hosts: ['jasoseol.com'], jobPath: /^\/recruit\/\d+\/?$/ },
});

export function sourceUrl(source, input, base) {
  const spec = SOURCES[source];
  let url;
  try { url = new URL(input, base); } catch { throw new CollectionError('INVALID_URL'); }
  if (!spec || url.protocol !== 'https:' || url.username || url.password || url.port || !spec.hosts.includes(url.hostname)) {
    throw new CollectionError('URL_NOT_ALLOWED');
  }
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { throw new CollectionError('INVALID_URL'); }
  if (/[\\%\x00-\x1f]/.test(path) || /%2f/i.test(url.pathname) || /\/(api|login|join|users?|account|profile|apply)(\/|$)/i.test(path) ||
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
  if (!input || !Array.isArray(input.sources) || !input.sources.length || input.sources.length > 5) throw new CollectionError('INVALID_CONFIG');
  const names = new Set();
  const sources = input.sources.map(item => {
    if (!item || !SOURCES[item.id] || names.has(item.id) || typeof item.enabled !== 'boolean' ||
        !Array.isArray(item.startUrls) || !item.startUrls.length || item.startUrls.length > 10) throw new CollectionError('INVALID_CONFIG');
    names.add(item.id);
    return { id: item.id, enabled: item.enabled, startUrls: [...new Set(item.startUrls.map(url => sourceUrl(item.id, url)))] };
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
