import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, renameSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function reader() {
  const module = await import('./runtime-secrets.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof module.createSecretReader, 'function', 'protected runtime reader exists');
  return module.createSecretReader;
}
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pm-secret-reader-'));
  chmodSync(dir, 0o750);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  function generation(name, suffix) {
    mkdirSync(join(dir, name), { mode: 0o750 });
    for (const [key, value] of Object.entries({ DATABASE_URL: `postgresql://fixture:${suffix}@db/project_management`, SESSION_SECRET: `fixture-session-${suffix}` })) {
      writeFileSync(join(dir, name, key), value, { mode: 0o640 });
    }
  }
  generation('g-aaaaaa', 'a'); generation('g-bbbbbb', 'b');
  symlinkSync('g-aaaaaa', join(dir, 'current'));
  return dir;
}

test('reader pins a complete generation and only a new reader sees rotation', async t => {
  const create = await reader(), dir = fixture(t);
  const read = create({ directory: dir, ownerUid: process.getuid() });
  assert.equal(read('DATABASE_URL'), 'postgresql://fixture:a@db/project_management');
  symlinkSync('g-bbbbbb', join(dir, 'next')); renameSync(join(dir, 'next'), join(dir, 'current'));
  assert.equal(read('SESSION_SECRET'), 'fixture-session-a');
  assert.equal(create({ directory: dir, ownerUid: process.getuid() })('SESSION_SECRET'), 'fixture-session-b');
  assert.equal(read('APP_PASSWORD_HASH'), undefined);
  assert.throws(() => read('../DATABASE_URL'), /RUNTIME_SECRET_UNAVAILABLE/);
});

test('configured file mode fails closed for missing, writable, symlinked or invalid content', async t => {
  const create = await reader();
  for (const mutate of [
    dir => rmSync(join(dir, 'g-aaaaaa/SESSION_SECRET')),
    dir => chmodSync(join(dir, 'g-aaaaaa/DATABASE_URL'), 0o666),
    dir => { rmSync(join(dir, 'g-aaaaaa/SESSION_SECRET')); symlinkSync('DATABASE_URL', join(dir, 'g-aaaaaa/SESSION_SECRET')); },
    dir => writeFileSync(join(dir, 'g-aaaaaa/DATABASE_URL'), 'fixture\0must-not-leak'),
    dir => writeFileSync(join(dir, 'g-aaaaaa/DATABASE_URL'), Buffer.from([0xff])),
    dir => writeFileSync(join(dir, 'g-aaaaaa/DATABASE_URL'), Buffer.alloc(65537, 65)),
    dir => chmodSync(join(dir, 'g-aaaaaa'), 0o777),
    dir => { rmSync(join(dir, 'current')); symlinkSync('/tmp', join(dir, 'current')); },
  ]) {
    const dir = fixture(t); mutate(dir);
    assert.throws(() => create({ directory: dir, ownerUid: process.getuid() })('DATABASE_URL'), error => error.message === 'RUNTIME_SECRET_UNAVAILABLE');
  }
});

test('runtime selector retains development env mode but never falls back after file mode is configured', async () => {
  await reader();
  const { getRuntimeSecret } = await import('./runtime-secrets.mjs');
  const previous = { dir: process.env.PM_SECRET_DIRECTORY, url: process.env.DATABASE_URL };
  try {
    delete process.env.PM_SECRET_DIRECTORY; process.env.DATABASE_URL = 'fixture-development';
    assert.equal(getRuntimeSecret('DATABASE_URL'), 'fixture-development');
    process.env.PM_SECRET_DIRECTORY = '/missing-fixture-runtime';
    assert.throws(() => getRuntimeSecret('DATABASE_URL'), /RUNTIME_SECRET_UNAVAILABLE/);
    process.env.PM_SECRET_DIRECTORY = '';
    assert.throws(() => getRuntimeSecret('DATABASE_URL'), /RUNTIME_SECRET_UNAVAILABLE/);
  } finally {
    if (previous.dir === undefined) delete process.env.PM_SECRET_DIRECTORY; else process.env.PM_SECRET_DIRECTORY = previous.dir;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
  }
});

test('AI ingestion pool refuses stale env credentials when its mounted generation is unavailable', async () => {
  const { createPool } = await import('../ai-ops/store.mjs');
  const previous = { dir: process.env.PM_SECRET_DIRECTORY, url: process.env.DATABASE_URL };
  try {
    process.env.PM_SECRET_DIRECTORY = '/missing-fixture-runtime';
    process.env.DATABASE_URL = 'postgresql://stale:fixture@127.0.0.1:1/project_management';
    assert.throws(() => createPool(), /RUNTIME_SECRET_UNAVAILABLE/);
  } finally {
    if (previous.dir === undefined) delete process.env.PM_SECRET_DIRECTORY; else process.env.PM_SECRET_DIRECTORY = previous.dir;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
  }
});

test('HTTP pool can be imported without build secrets but validates configuration before first DB use', async () => {
  const { createLazyPool } = await import('../ai-ops/store.mjs');
  assert.equal(typeof createLazyPool, 'function');
  const previous = { dir: process.env.PM_SECRET_DIRECTORY, url: process.env.DATABASE_URL };
  try {
    delete process.env.PM_SECRET_DIRECTORY; delete process.env.DATABASE_URL;
    const pool = createLazyPool();
    assert.throws(() => pool.query('SELECT 1'), /DATABASE_CONFIGURATION/);
    await pool.end();
    process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:1/project_management';
    const configured = createLazyPool();
    assert.equal(configured.options.connectionString, 'postgresql://fixture:fixture@127.0.0.1:1/project_management');
    await configured.end();
  } finally {
    if (previous.dir === undefined) delete process.env.PM_SECRET_DIRECTORY; else process.env.PM_SECRET_DIRECTORY = previous.dir;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
  }
});
