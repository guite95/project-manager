import { setTimeout as delay } from 'node:timers/promises';
import { CollectionError, sourceUrl } from './config.mjs';

export const USER_AGENT = 'ProjectManagementJobCollector/0.1';
const MAX_BYTES = 2 * 1024 * 1024;

function normalizedOctets(value) {
  return value.replace(/[^\x00-\x7f]/gu, char => encodeURIComponent(char))
    .replace(/%([\da-f]{2})/gi, (encoded, hex) => {
      const char = String.fromCharCode(Number.parseInt(hex, 16));
      return /^[a-z\d._~-]$/i.test(char) ? char : encoded.toUpperCase();
    });
}

/** 같은 사용자 에이전트의 그룹은 합치고, 가장 긴 경로 규칙을 우선한다. */
export function robotsPolicy(body, userAgent = USER_AGENT) {
  if (/<(?:html|!doctype)/i.test(body)) throw new CollectionError('ROBOTS_UNAVAILABLE');
  const groups = [];
  let group = { agents: [], rules: [], delay: 0 }, hasDirectives = false;
  for (const line of body.split(/\r?\n/)) {
    const match = line.replace(/#.*/, '').match(/^\s*([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    const name = match[1].trim().toLowerCase(), value = match[2];
    if (name === 'user-agent') {
      if (hasDirectives) { groups.push(group); group = { agents: [], rules: [], delay: 0 }; hasDirectives = false; }
      group.agents.push(value.toLowerCase());
    } else if (group.agents.length) {
      hasDirectives = true;
      if ((name === 'allow' || name === 'disallow') && value) group.rules.push({ allow: name === 'allow', path: value });
      if (name === 'crawl-delay' && /^\d+(?:\.\d+)?$/.test(value)) group.delay = Math.max(group.delay, Number(value) * 1000);
    }
  }
  groups.push(group);
  const agent = userAgent.toLowerCase();
  const specificity = item => Math.max(-1, ...item.agents.map(name => name === '*' ? 0 : agent.includes(name) ? name.length : -1));
  const best = Math.max(-1, ...groups.map(specificity));
  const selected = best < 0 ? [] : groups.filter(item => specificity(item) === best);
  return {
    delayMs: Math.max(0, ...selected.map(item => item.delay)),
    allows(url) {
      const parsed = new URL(url);
      const target = normalizedOctets(parsed.pathname + parsed.search);
      let winningLength = -1, allowed = true;
      for (const rule of selected.flatMap(item => item.rules)) {
        const anchored = rule.path.endsWith('$');
        const path = normalizedOctets(anchored ? rule.path.slice(0, -1) : rule.path);
        const pattern = path.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        if (!new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(target)) continue;
        const length = path.replaceAll('*', '').length;
        if (length > winningLength || length === winningLength && rule.allow) {
          winningLength = length; allowed = rule.allow;
        }
      }
      return allowed;
    },
  };
}

export function createHttpClient(source, config, { fetchImpl = fetch, wait = delay, now = Date.now, signal, heartbeat = async () => {} } = {}) {
  const robots = new Map();
  let lastRequestAt = null, intervalMs = config.requestIntervalMs;
  let requests = 0;
  const maxRequests = config.maxPages * 6 + 12;

  async function request(url) {
    signal?.throwIfAborted();
    await heartbeat();
    if (++requests > maxRequests) throw new CollectionError('REQUEST_BUDGET');
    if (lastRequestAt !== null) await wait(Math.max(0, lastRequestAt + intervalMs - now()), undefined, { signal });
    const timeout = AbortSignal.timeout(config.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    lastRequestAt = now();
    try {
      const response = await fetchImpl(url, {
        redirect: 'manual', signal: requestSignal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml,text/xml,text/plain' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new CollectionError('INVALID_REDIRECT');
        return { redirect: sourceUrl(source, location, url) };
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new CollectionError(`HTTP_${response.status}`);
      }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body?.cancel();
        throw new CollectionError('RESPONSE_TOO_LARGE');
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!/^(?:text\/(?:html|plain|xml)|application\/(?:xml|xhtml\+xml))(?:;|$)/i.test(contentType)) {
        await response.body?.cancel();
        throw new CollectionError('UNSUPPORTED_CONTENT_TYPE');
      }
      let size = 0;
      const chunks = [];
      if (response.body) {
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > MAX_BYTES) throw new CollectionError('RESPONSE_TOO_LARGE');
          chunks.push(chunk);
        }
      }
      return { url, body: Buffer.concat(chunks).toString('utf8'), contentType };
    } catch (error) {
      if (error instanceof CollectionError) throw error;
      if (signal?.aborted) throw new CollectionError('ABORTED');
      throw new CollectionError(timeout.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR');
    }
  }

  async function policyFor(url) {
    const origin = new URL(url).origin;
    if (!robots.has(origin)) {
      let body;
      try {
        const response = await request(`${origin}/robots.txt`);
        // robots의 다른 경로로의 리디렉션은 허용으로 해석하지 않는다.
        if (response.redirect) throw new CollectionError('ROBOTS_UNAVAILABLE');
        body = response.body;
      } catch (error) {
        if (['ABORTED', 'LEASE_LOST'].includes(error.code)) throw error;
        if (error.code === 'HTTP_404') body = '';
        else throw new CollectionError('ROBOTS_UNAVAILABLE');
      }
      const policy = robotsPolicy(body);
      if (policy.delayMs > 30000) throw new CollectionError('CRAWL_DELAY_UNSUPPORTED');
      intervalMs = Math.max(intervalMs, policy.delayMs);
      robots.set(origin, policy);
    }
    return robots.get(origin);
  }

  return {
    get requests() { return requests; },
    async get(input) {
      let url = sourceUrl(source, input);
      for (let hop = 0; hop < 5; hop++) {
        signal?.throwIfAborted();
        if (!(await policyFor(url)).allows(url)) throw new CollectionError('ROBOTS_DISALLOWED');
        const response = await request(url);
        if (!response.redirect) return response;
        url = response.redirect;
      }
      throw new CollectionError('TOO_MANY_REDIRECTS');
    },
  };
}
