import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const configUrl = new URL('../../nginx/project-management.conf', import.meta.url);
const nextConfigUrl = new URL('../../next.config.ts', import.meta.url);

function bytes(value, unit) {
  const multiplier = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[unit.toLowerCase()] ?? 1;
  return Number(value) * multiplier;
}

test('public Nginx accepts 250MiB materials plus multipart overhead', async () => {
  const config = await readFile(configUrl, 'utf8');
  const limits = [...config.matchAll(/\bclient_max_body_size\s+(\d+)\s*([kmg]?)\s*;/gi)]
    .map(([, value, unit]) => bytes(value, unit));

  assert.ok(limits.some(limit => limit >= 251 * 1024 ** 2), 'Nginx upload limit must be at least 251MiB');
});

test('Next proxy accepts 250MiB materials plus multipart overhead', async () => {
  const config = await readFile(nextConfigUrl, 'utf8');
  const match = config.match(/proxyClientMaxBodySize:\s*['"](\d+)mb['"]/i);
  assert.ok(match && Number(match[1]) >= 251, 'Next proxy upload limit must be at least 251MiB');
});
