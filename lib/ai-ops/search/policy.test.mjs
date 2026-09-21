import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { embeddingsEnabled } from './policy.mjs';
import { enqueueDocuments, indexSession, indexPendingSessions } from './indexer.mjs';
import { claimJobs, runEmbeddingBatch, retryFailed } from './worker.mjs';
import { GoogleEmbeddingProvider, createEmbeddingProvider } from './provider.mjs';
import { retrieve } from './retrieval.mjs';

delete process.env.AI_OPS_EMBEDDING_ENABLED;

test('embedding requires explicit opt-in', () => {
  for (const value of [undefined, '', 'false', '1', 'TRUE'])
    assert.equal(embeddingsEnabled({ AI_OPS_EMBEDDING_ENABLED: value }), false);
  assert.equal(embeddingsEnabled({ AI_OPS_EMBEDDING_ENABLED: 'true' }), true);
});
test('paused indexing and workers never access DB or provider', async () => {
  const forbidden = new Proxy({}, { get() { throw new Error('unexpected access'); } });
  for (const run of [
    () => enqueueDocuments(forbidden, 'profile'),
    () => indexSession(forbidden, 'session', forbidden),
    () => indexPendingSessions(forbidden, forbidden),
    () => claimJobs(forbidden, 'profile'),
    () => runEmbeddingBatch(forbidden, forbidden),
    () => retryFailed(forbidden, 'profile'),
  ]) await assert.rejects(run, { code: 'EMBEDDING_PAUSED' });
  assert.throws(() => createEmbeddingProvider(), { code: 'EMBEDDING_PAUSED' });
  const provider = new GoogleEmbeddingProvider({}, forbidden);
  await assert.rejects(provider.embed([{ content: 'private' }], 'DOCUMENT'), { code: 'EMBEDDING_PAUSED' });
  await assert.rejects(provider.embed([{ content: 'query' }], 'QUERY'), { code: 'EMBEDDING_PAUSED' });
});
test('paused hybrid search queries original messages without vector or provider access', async () => {
  const queries = [];
  const pool = { query: async sql => { queries.push(sql); return { rows: [] }; } };
  const provider = new Proxy({}, { get() { throw new Error('unexpected provider access'); } });
  const result = await retrieve(pool, { mode: 'hybrid', query: 'nginx', limit: 10 }, { provider });
  assert.equal(result.mode, 'keyword');
  assert.equal(result.fallbackReason, 'EMBEDDING_PAUSED');
  assert.deepEqual(result.messages, []);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /FROM ai_ops_message/);
  assert.doesNotMatch(queries[0], /ai_ops_embedding|ai_ops_search_document/);
});
test('paused CLI apply commands exit without a database connection', () => {
  for (const command of ['backfill', 'worker', 'retry']) {
    const result = spawnSync(process.execPath, ['scripts/ai-ops-search.mjs', command, '--apply'], {
      encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'invalid', AI_OPS_EMBEDDING_ENABLED: 'false' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'paused');
  }
});
