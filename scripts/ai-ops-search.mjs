#!/usr/bin/env node
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
import { evaluateRanking } from "../lib/ai-ops/search/ranking.mjs";

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
    const dataset = JSON.parse(await readFile(args[0], "utf8"));
    if (!Array.isArray(dataset) || !dataset.length || dataset.length > 1000)
      throw new Error("Invalid evaluation dataset");
    const metrics = [];
    for (const example of dataset) {
      if (
        !example.relevant ||
        typeof example.relevant !== "object" ||
        Array.isArray(example.relevant) ||
        Object.values(example.relevant).some(
          (v) => !Number.isInteger(v) || v < 0 || v > 3,
        )
      )
        throw new Error("Invalid relevance labels");
      const result = await retrieve(
        pool,
        { query: example.query, mode: "hybrid", limit: 100 },
        { config },
      );
      if (result.fallbackReason)
        throw new Error("Evaluation requires a ready embedding index/provider");
      metrics.push(
        evaluateRanking(
          result.messages.map((m) => m.sessionId),
          example.relevant,
        ),
      );
    }
    const average = Object.fromEntries(
      Object.keys(metrics[0]).map((key) => [
        key,
        metrics.reduce((sum, m) => sum + m[key], 0) / metrics.length,
      ]),
    );
    console.log(
      JSON.stringify(
        { profileId: config.id, queries: metrics.length, ...average },
        null,
        2,
      ),
    );
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
