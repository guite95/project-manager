import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';
import { CollectionError, isJobUrl, isWantedListUrl, sourceUrl } from './config.mjs';
import { recognizedJobUrl } from './identity.mjs';

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
function experienceText(value) {
  if (Array.isArray(value)) return value.map(experienceText).filter(Boolean).join('; ') || null;
  if (typeof value === 'string') return text(value) || null;
  if (value && typeof value === 'object') {
    const months = value.monthsOfExperience;
    if (typeof months === 'number' && Number.isFinite(months) && months >= 0 && months <= 720) {
      return `경력 ${months / 12}년 이상`;
    }
    return text(value.description) || null;
  }
  return null;
}
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

function visitPageData(html, visit) {
  const chunks = [];
  for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const match = script.trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
    if (!match) continue;
    try {
      const [kind, chunk] = JSON.parse(match[1]);
      if (kind === 1 && typeof chunk === 'string') chunks.push(chunk);
    } catch { /* JavaScript는 실행하지 않는다. */ }
  }
  const walk = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 30) return;
    visit(value);
    for (const nested of Object.values(value)) walk(nested, depth + 1);
  };
  // 길이 기반 텍스트 레코드 직후의 독립 청크와 청크 사이에서 나뉜 JSON을 함께 지원한다.
  const lines = new Set([...chunks.flatMap(chunk => chunk.split('\n')), ...chunks.join('').split('\n')]);
  for (const line of lines) {
    const record = line.match(/^[a-f\d]+:([\[{].*)$/i);
    if (record) { try { walk(JSON.parse(record[1])); } catch { /* 미지원 Flight 레코드는 건너뛴다. */ } }
  }
}

function metaValues(html) {
  return Object.fromEntries([...html.matchAll(/<meta\b([^>]*)>/gi)].map(match => {
    const attr = attributes(match[1]);
    return [attr.name?.toLowerCase() ?? attr.property?.toLowerCase(), plainText(attr.content)];
  }));
}

function jobkoreaFields(html, url) {
  const id = new URL(url).pathname.split('/').at(-1);
  let data;
  visitPageData(html, value => {
    if (String(value.extension?.common?.jobId) === id && value.base?.title) data = value.base;
  });
  if (!data) return null;
  const careers = Array.isArray(data.requirement?.careers) ? data.requirement.careers : [];
  const experienced = careers.filter(item => item.type === 'EXPERIENCED');
  const experience = careers.some(item => item.type === 'NEWBIE') ? (experienced.length ? '신입·경력' : '신입')
    : experienced.map(item => typeof item.range?.from === 'number'
      ? `경력 ${item.range.from}년 ${item.range.fromInclusive === false ? '초과' : '이상'}` : '경력').join('; ') || null;
  const overview = data.overview;
  const body = (overview?.descriptions ?? []).map(item => plainText(item.content)).filter(Boolean).join('\n');
  const work = (overview?.recruitment?.workFields ?? []).map(text).filter(Boolean).join(', ');
  return {
    positionKey: id, title: text(data.title), company: text(data.post?.postingCompanyName) || null,
    experience, description: (body || (work ? `담당업무\n${work}` : '')).slice(0, 60000),
    postedAt: dateValue(data.post?.postingStartAt), deadline: dateValue(overview?.recruitment?.applicationEndAt, true),
    locations: (data.workCondition?.workplace?.locationAttributes ?? []).map(item => text(item.fullAddress)).filter(Boolean),
    extraction: 'jobkorea-page-data', detailStatus: body ? 'AVAILABLE' : 'UNVERIFIED',
  };
}

function elementBody(html, className) {
  for (const match of html.matchAll(/<div\b([^>]*)>/gi)) {
    if (!(attributes(match[1]).class ?? '').split(/\s+/).includes(className)) continue;
    const start = match.index + match[0].length;
    let depth = 1;
    for (const tag of html.slice(start).matchAll(/<\/?div\b[^>]*>/gi)) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (!depth) return html.slice(start, start + tag.index);
    }
  }
  return '';
}

function saraminFields(html, url) {
  const meta = metaValues(html);
  const titleParts = meta['og:title']?.match(/^\[([^\]]+)\]\s*(.+?)\s*-\s*사람인$/);
  const summary = meta.description;
  if (!titleParts || !summary || !/경력:/.test(summary)) return null;
  const id = new URL(url).searchParams.get('rec_idx');
  const body = plainText(elementBody(html, `jobsViewDetail_${id}`));
  return {
    positionKey: id, company: titleParts[1],
    title: titleParts[2].replace(/\((?:D-\d+|오늘\s*마감|상시\s*채용|채용시\s*마감|마감)\)\s*$/, '').trim(),
    experience: summary.match(/경력:\s*(.*?)\s*,\s*학력:/)?.[1] || null,
    education: summary.match(/학력:\s*((?:[^,()]|\([^)]*\))+)/)?.[1]?.trim() || null,
    deadline: dateValue(summary.match(/마감일:\s*(\d{4}-\d{2}-\d{2})/)?.[1], true),
    description: (body || summary).slice(0, 60000), extraction: 'saramin-public-html', detailStatus: body ? 'AVAILABLE' : 'UNVERIFIED',
  };
}

function wantedFields(html, url) {
  const id = new URL(url).pathname.split('/').at(-1);
  let data;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attributes(match[1]).id !== '__NEXT_DATA__') continue;
    try { data = JSON.parse(match[2]).props?.pageProps?.initialData; } catch { /* JSON만 읽는다. */ }
  }
  if (!data || String(data.id) !== id || !text(data.position)) return null;
  const career = data.career;
  const from = career?.annual_from, to = career?.annual_to;
  const experience = career?.is_newbie === true ? '신입·경력'
    : Number.isInteger(from) && from >= 0 && from <= 60
      ? Number.isInteger(to) && to >= from && to <= 60 ? `경력 ${from}~${to}년` : `경력 ${from}년 이상` : null;
  const description = [['포지션 소개',data.intro],['담당업무',data.main_tasks],['자격요건',data.requirements],
    ['우대사항',data.preferred_points],['혜택 및 복지',data.benefits],['채용 절차',data.hire_rounds]]
    .map(([label,value]) => { const body = plainText(value); return body ? `${label}\n${body}` : ''; }).filter(Boolean).join('\n\n').slice(0,60000);
  return {
    positionKey:id, title:text(data.position), company:text(data.company?.company_name) || null,
    experience, description, locations:[text(data.address?.full_location)].filter(Boolean),
    postedAt:dateValue(data.confirm_time), deadline:dateValue(data.due_time ?? data.close_time,true),
    status:data.status === 'close' ? 'CLOSED' : ['active','open'].includes(data.status) ? 'OPEN' : undefined,
    extraction:'wanted-page-data', detailStatus:description ? 'AVAILABLE' : 'MISSING',
  };
}

function postingStatus(platform, deadline, now) {
  if (platform?.status === 'CLOSED' || deadline && new Date(deadline) <= now) return 'CLOSED';
  return platform?.status === 'OPEN' || deadline ? 'OPEN' : 'UNKNOWN';
}

function zighangOriginUrls(html, url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'zighang.com') return [];
  const id = parsed.pathname.split('/').at(-1);
  const urls = [];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 30 || urls.length >= 10) return;
    // 공개 HTML에 포함된 현재 상세 공고만 읽는다. 추천 공고나 임의 URL은 연결하지 않는다.
    const job = value.recruitment;
    if (job?.id === id && job.applyMethod === 'URL' && typeof job.redirectUrl === 'string') urls.push(job.redirectUrl);
    for (const nested of Object.values(value)) visit(nested, depth + 1);
  };
  for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const match = script.trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
    if (!match) continue;
    try {
      // 스크립트를 실행하지 않고 고정 형식의 JSON 인수만 파싱한다.
      const [kind, chunk] = JSON.parse(match[1]);
      if (kind !== 1 || typeof chunk !== 'string') continue;
      for (const line of chunk.split('\n')) {
        const record = line.match(/^[a-f\d]+:([\[{].*)$/i);
        if (record) { try { visit(JSON.parse(record[1])); } catch { /* 분할/미지원 레코드는 건너뛴다. */ } }
      }
    } catch { /* 페이지 형식이 바뀌면 연결 근거 없음으로 남긴다. */ }
  }
  return urls;
}

function originUrls(html, url, declaredUrl, useAnchors) {
  const candidates = [declaredUrl, ...(useAnchors ? zighangOriginUrls(html,url) : [])];
  if (useAnchors) for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const label = plainText(match[2]);
    if (/^(?:지원(?:하러)?\s*가기|지원하기|원문(?:\s*(?:보기|공고))?|공고\s*(?:원문|보러\s*가기))$/.test(label)) {
      candidates.push(attributes(match[1]).href?.replaceAll('&amp;', '&'));
    }
  }
  return [...new Set(candidates.map(candidate => recognizedJobUrl(candidate)?.url).filter(candidate => candidate && candidate !== url))].slice(0, 10);
}

export function parseJobPage(source, inputUrl, html, now = new Date()) {
  const url = sourceUrl(source, inputUrl);
  if (!isJobUrl(source, url)) throw new CollectionError('NOT_A_JOB_URL');
  const platform = source === 'jobkorea' ? jobkoreaFields(html, url) : source === 'saramin' ? saraminFields(html, url)
    : source === 'wanted' ? wantedFields(html,url) : null;
  const postings = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attributes(match[1]).type?.toLowerCase() !== 'application/ld+json') continue;
    try { findPostings(JSON.parse(match[2]), postings); } catch { /* 잘못된 한 블록이 나머지 공고를 막지 않는다. */ }
  }
  const result = postings.filter(item => text(item.title)).map(item => {
    const title = text(item.title);
    const identifier = typeof item.identifier === 'object' ? item.identifier?.value : item.identifier;
    const positionKey = typeof identifier === 'string' || typeof identifier === 'number' ? String(identifier).slice(0, 500) : title;
    const enrichment = postings.length === 1 ? platform : null;
    const deadline = enrichment?.deadline ?? dateValue(item.validThrough, true);
    const description = plainText(item.description).slice(0, 60000);
    return normalized(source, url, {
      positionCount: postings.length, title, company: text(item.hiringOrganization?.name) || null,
      originUrls: originUrls(html, url, item.url, postings.length === 1),
      description, locations: locations(item.jobLocation),
      employmentType: (Array.isArray(item.employmentType) ? item.employmentType : [item.employmentType]).filter(item => typeof item === 'string').map(text),
      experience: experienceText(item.experienceRequirements),
      education: text(item.educationRequirements) || null,
      postedAt: dateValue(item.datePosted),
      extraction: 'json-ld', detailStatus: description ? 'AVAILABLE' : 'MISSING',
      ...enrichment,
      positionKey, deadline, status: postingStatus(enrichment,deadline,now),
    }, now);
  });
  if (result.length) return [...new Map(result.map(job => [job.id, job])).values()];
  if (platform) return [normalized(source, url, {
    positionCount: 1, originUrls: [], locations: [], employmentType: [], education: null, postedAt: null,
    ...platform, status: postingStatus(platform,platform.deadline,now),
  }, now)];

  // 구조화 데이터가 없으면 확인 가능한 제목과 본문만 보존한다. 자격조건을 추측하지 않는다.
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1]);
  const body = html.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i)?.[2];
  if (!title || !body || /access denied|captcha|just a moment|접근이 제한|로그인|시스템.*점검/i.test(title)) {
    throw new CollectionError('UNSUPPORTED_PAGE');
  }
  return [normalized(source, url, {
    positionKey: 'page', positionCount: 1, title, company: null, description: plainText(body).slice(0, 60000),
    originUrls: originUrls(body, url, null, true),
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
  if (source === 'wanted' && isWantedListUrl(base)) {
    let data;
    try { data = JSON.parse(body); } catch { throw new CollectionError('UNSUPPORTED_PAGE'); }
    if (!data || !Array.isArray(data.data)) throw new CollectionError('UNSUPPORTED_PAGE');
    for (const job of data.data) {
      if (job && /^[1-9]\d{0,11}$/.test(String(job.id))) add(`/wd/${job.id}`);
    }
    if (typeof data.links?.next === 'string') {
      try {
        const next = new URL(sourceUrl(source,data.links.next,base)), current = new URL(base);
        const expected = new URL(current);
        expected.searchParams.set('offset',String(Number(current.searchParams.get('offset')) + Number(current.searchParams.get('limit'))));
        expected.searchParams.sort();
        if (next.href === expected.href) add(next.href);
      } catch { /* 다른 조건·외부 주소·개인 API를 탐색하지 않는다. */ }
    }
    return {urls:[...new Set(links)],truncated,complete:data.data.length === 0 && !data.links?.next};
  } else if (/xml/i.test(contentType) || /^\s*(?:<\?xml[^>]*>\s*)?<(?:\w+:)?(?:sitemapindex|urlset)\b/i.test(body)) {
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
    const current = new URL(base);
    for (const match of body.matchAll(/<a\b([^>]*)>/gi)) {
      const attr = attributes(match[1]);
      let href = attr.href;
      if (source === 'saramin' && current.pathname === '/zf_user/search/recruit' && href === '#recruit_info' &&
          /(?:^|\s)page_move(?:\s|$)/.test(attr.class ?? '') && /^\d+$/.test(attr.page ?? '')) {
        const next = new URL(base);
        next.searchParams.set('recruitPage', attr.page);
        href = next.href;
      }
      if (href) {
        try {
          const url = sourceUrl(source, href.replace(/&amp;/g, '&'), base);
          if (isJobUrl(source, url)) add(url);
          else {
            const next = new URL(url);
            const pageKey = source === 'jobkorea' && /^\/Search\/?$/i.test(current.pathname) ? 'Page_No'
              : source === 'saramin' && current.pathname === '/zf_user/search/recruit' ? 'recruitPage' : null;
            if (!pageKey || next.pathname.replace(/\/$/, '') !== current.pathname.replace(/\/$/, '')) continue;
            const page = Number(current.searchParams.get(pageKey) ?? 1);
            if (Number(next.searchParams.get(pageKey)) !== page + 1) continue;
            const original = new URL(current);
            original.searchParams.delete(pageKey); next.searchParams.delete(pageKey);
            original.searchParams.sort(); next.searchParams.sort();
            if (original.search === next.search) add(url);
          }
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
