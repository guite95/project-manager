#!/usr/bin/env node
import { embeddingsEnabled } from "../lib/ai-ops/search/policy.mjs";
import { readFile } from "node:fs/promises";
import { createPool } from "../lib/ai-ops/store.mjs";
import {
  embeddingConfig,
  createEmbeddingProvider,
} from "../lib/ai-ops/search/provider.mjs";
import {
  indexPendingSessions,
  searchStatus,
} from "../lib/ai-ops/search/indexer.mjs";
import {
  runEmbeddingBatch,
  retryFailed,
} from "../lib/ai-ops/search/worker.mjs";
import { retrieve } from "../lib/ai-ops/search/retrieval.mjs";
import { validateDataset, scoreExample, summarizeEvaluation, compareEvaluation } from "../lib/ai-ops/search/evaluation.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["inspect", "backfill", "worker", "retry", "evaluate"].includes(command)) {
  console.log(
    "Usage: ai-ops-search.mjs inspect | backfill [--apply] [--batches N] | worker [--apply] [--batches N] | retry --apply | evaluate dataset.json",
  );
  process.exit(command ? 1 : 0);
}
const config = embeddingConfig();
const batchesIndex = args.indexOf("--batches");
const batches = batchesIndex < 0 ? 1 : Number(args[batchesIndex + 1]);
if (!Number.isInteger(batches) || batches < 1 || batches > 10000)
  throw new Error("Invalid --batches");
if (["backfill", "worker", "retry"].includes(command) && args.includes("--apply") && !embeddingsEnabled()) {
  console.log(JSON.stringify({ status: "paused", reason: "EMBEDDING_PAUSED" }));
  process.exit(0);
}
const pool = createPool();
try {
  if (
    command === "inspect" ||
    (["backfill", "worker", "retry"].includes(command) &&
      !args.includes("--apply"))
  ) {
    console.log(
      JSON.stringify(
        {
          embeddingsEnabled: embeddingsEnabled(),
          profile: {
            id: config.id,
            provider: config.provider,
            model: config.model,
            dimensions: config.dimensions,
            version: config.version,
          },
          ...(await searchStatus(pool, config.id)),
        },
        null,
        2,
      ),
    );
  } else if (command === "backfill") {
    for (let i = 0; i < batches; i++) {
      const indexed = await indexPendingSessions(pool, config, 20);
      console.log(JSON.stringify({ batch: i + 1, indexed }));
      if (!indexed) break;
    }
  } else if (command === "worker") {
    const provider = createEmbeddingProvider(config);
    for (let i = 0; i < batches; i++) {
      const indexed = await indexPendingSessions(pool, config, 20);
      const result = await runEmbeddingBatch(pool, provider, 4);
      console.log(JSON.stringify({ batch: i + 1, indexed, ...result }));
      if (!result.processed && !indexed) break;
    }
  } else if (command === "retry") {
    console.log(
      JSON.stringify({ retried: await retryFailed(pool, config.id) }),
    );
  } else if (command === "evaluate") {
    const dataset = validateDataset(JSON.parse(await readFile(args[0], "utf8")));
    const rows = [];
    for (const example of dataset) {
      const result = await retrieve(pool, { ...example.filters, query: example.query, mode: "hybrid", limit: 100 }, { config });
      rows.push(scoreExample(example, result));
    }
    const baselineIndex = args.indexOf("--baseline");
    let comparison;
    if (baselineIndex >= 0) {
      const baseline = JSON.parse(await readFile(args[baselineIndex + 1], "utf8"));
      comparison = compareEvaluation(Array.isArray(baseline) ? baseline : baseline.results, rows);
    }
    console.log(JSON.stringify({ profileId: config.id, queries: rows.length, summary: summarizeEvaluation(rows), comparison, results: rows }, null, 2));
    if (comparison && !comparison.passed) process.exitCode = 2;
  }
} catch (error) {
  // Never dump provider/PG exceptions: they can contain private content or credentials.
  console.error(
    JSON.stringify({
      error: /^[A-Z0-9_]{2,40}$/.test(error?.code ?? "")
        ? error.code
        : "AI_SEARCH_COMMAND_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
