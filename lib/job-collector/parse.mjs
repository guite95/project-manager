import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';
import { CollectionError, isJobUrl, sourceUrl } from './config.mjs';

export function plainText(value) {
  if (typeof value !== 'string') return '';
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/(?:p|div|li|h[1-6]|section)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, key) => {
      if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? original;
      const code = Number.parseInt(key.slice(/^#x/i.test(key) ? 2 : 1), /^#x/i.test(key) ? 16 : 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    }).replace(/[ \t\r]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]));
}

function findPostings(value, out, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 20) return;
  if (Array.isArray(value)) { for (const item of value) findPostings(item, out, depth + 1); return; }
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some(type => typeof type === 'string' && /(?:^|[\/#])JobPosting$/.test(type))) out.push(value);
  else for (const nested of Object.values(value)) findPostings(nested, out, depth + 1);
}

function dateValue(input, endOfDay = false) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value += endOfDay ? 'T23:59:59+09:00' : 'T00:00:00+09:00';
  // 시간대가 없는 날짜를 서버 시간대로 임의 해석하지 않는다.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

const text = value => plainText(typeof value === 'string' ? value : '').slice(0, 1000);
function locations(value) {
  return (Array.isArray(value) ? value : value ? [value] : []).map(place => {
    const address = place?.address;
    return typeof address === 'string' ? text(address) : [address?.addressRegion, address?.addressLocality, address?.streetAddress].filter(item => typeof item === 'string').map(text).join(' ');
  }).filter(Boolean);
}

function normalized(source, url, fields, now) {
  const content = { source, url, ...fields };
  const id = createHash('sha256').update(`${source}\n${url}\n${fields.positionKey}`).digest('hex');
  const contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
  return { ...content, id, contentHash, collectedAt: now.toISOString() };
}

export function parseJobPage(source, inputUrl, html, now = new Date()) {
  const url = sourceUrl(source, inputUrl);
  if (!isJobUrl(source, url)) throw new CollectionError('NOT_A_JOB_URL');
  const postings = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attributes(match[1]).type?.toLowerCase() !== 'application/ld+json') continue;
    try { findPostings(JSON.parse(match[2]), postings); } catch { /* 잘못된 한 블록이 나머지 공고를 막지 않는다. */ }
  }
  const result = postings.filter(item => text(item.title)).map(item => {
    const title = text(item.title);
    const identifier = typeof item.identifier === 'object' ? item.identifier?.value : item.identifier;
    const positionKey = typeof identifier === 'string' || typeof identifier === 'number' ? String(identifier).slice(0, 500) : title;
    const deadline = dateValue(item.validThrough, true);
    const description = plainText(item.description).slice(0, 60000);
    return normalized(source, url, {
      positionKey, title, company: text(item.hiringOrganization?.name) || null,
      description, locations: locations(item.jobLocation),
      employmentType: (Array.isArray(item.employmentType) ? item.employmentType : [item.employmentType]).filter(item => typeof item === 'string').map(text),
      experience: text(item.experienceRequirements) || null,
      education: text(item.educationRequirements) || null,
      postedAt: dateValue(item.datePosted), deadline,
      status: deadline ? (new Date(deadline) <= now ? 'CLOSED' : 'OPEN') : 'UNKNOWN',
      extraction: 'json-ld', detailStatus: description ? 'AVAILABLE' : 'MISSING',
    }, now);
  });
  if (result.length) return [...new Map(result.map(job => [job.id, job])).values()];

  // 구조화 데이터가 없으면 확인 가능한 제목과 본문만 보존한다. 자격조건을 추측하지 않는다.
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1]);
  const body = html.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i)?.[2];
  if (!title || !body || /access denied|captcha|just a moment|접근이 제한|로그인|시스템.*점검/i.test(title)) {
    throw new CollectionError('UNSUPPORTED_PAGE');
  }
  return [normalized(source, url, {
    positionKey: 'page', title, company: null, description: plainText(body).slice(0, 60000),
    locations: [], employmentType: [], experience: null, education: null, postedAt: null, deadline: null,
    status: 'UNKNOWN', extraction: 'page-text', detailStatus: 'UNVERIFIED',
  }, now)];
}

export function discoverLinks(source, base, body, contentType) {
  const links = [];
  let truncated = false;
  const add = value => {
    try {
      const url = sourceUrl(source, value, base);
      if (links.length < 10000) links.push(url); else truncated = true;
    } catch { /* 외부 지원 링크와 내부 API는 따라가지 않는다. */ }
  };
  if (/xml/i.test(contentType) || /^\s*(?:<\?xml[^>]*>\s*)?<(?:\w+:)?(?:sitemapindex|urlset)\b/i.test(body)) {
    let inLoc = false, value = '', root = null;
    const parser = new SaxesParser({ xmlns: true });
    parser.on('doctype', () => { throw new CollectionError('INVALID_SITEMAP'); });
    parser.on('opentag', tag => {
      if (!root) {
        root = tag.local;
        if (!['sitemapindex', 'urlset'].includes(root)) throw new CollectionError('INVALID_SITEMAP');
      }
      if (tag.local === 'loc') { inLoc = true; value = ''; }
    });
    parser.on('text', part => { if (inLoc) value += part; });
    parser.on('cdata', part => { if (inLoc) value += part; });
    parser.on('closetag', tag => {
      if (tag.local === 'loc') {
        if (root === 'sitemapindex' || isJobUrl(source, value.trim())) add(value.trim());
        inLoc = false;
      }
    });
    try { parser.write(body).close(); } catch { throw new CollectionError('INVALID_SITEMAP'); }
  } else {
    for (const match of body.matchAll(/<a\b([^>]*)>/gi)) {
      const href = attributes(match[1]).href;
      if (href) {
        try {
          const url = sourceUrl(source, href.replace(/&amp;/g, '&'), base);
          if (isJobUrl(source, url)) add(url);
        } catch { /* 외부 링크는 이 수집원의 대상이 아니다. */ }
      }
    }
  }
  return { urls: [...new Set(links)], truncated };
}

export function matchedKeywords(job, keywords) {
  const haystack = `${job.title}\n${job.description}`.normalize('NFKC').toLocaleLowerCase('en-US');
  return keywords.filter(word => {
    const needle = word.normalize('NFKC').toLocaleLowerCase('en-US');
    if (/^[a-z\d+#. -]+$/.test(needle)) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(haystack);
    }
    return haystack.includes(needle);
  });
}
