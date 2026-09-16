import {
  createPool,
  ingestBatch,
  MAX_BATCH_BYTES,
} from "../lib/ai-ops/store.mjs";
let pool;
try {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_BATCH_BYTES) throw new Error("size");
    chunks.push(chunk);
  }
  const batch = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!process.env.DATABASE_URL) throw new Error("configuration");
  pool = createPool();
  let result;
  if (batch?.version === 1 && batch?.probe === true) {
    await pool.query("SELECT id FROM ai_ops_device LIMIT 0");
    await pool.query("SELECT id FROM ai_ops_session LIMIT 0");
    await pool.query("SELECT id FROM ai_ops_message LIMIT 0");
    await pool.query("SELECT id FROM ai_ops_usage LIMIT 0");
    result = { ok: true };
  } else result = await ingestBatch(pool, batch);
  process.stdout.write(JSON.stringify(result) + "\n");
} catch {
  process.stderr.write("AI_OPS_INGEST_FAILED\n");
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
