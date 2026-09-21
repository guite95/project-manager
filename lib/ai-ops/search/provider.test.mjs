// 기존 임베딩 계약은 명시적으로 활성화한 테스트 환경에서만 검증한다.
process.env.AI_OPS_EMBEDDING_ENABLED = "true";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createGoogleRuntimeAuth } from '../../server/google-runtime-auth.mjs';
import {
  GoogleEmbeddingProvider,
  embeddingConfig,
  formatRetrievalInput,
  validateVector,
  retryPolicy,
} from "./provider.mjs";

test("defaults and retrieval formatting follow Gemini Embedding 2 instructions", () => {
  const c = embeddingConfig({});
  assert.equal(c.provider, "google");
  assert.equal(c.model, "gemini-embedding-2");
  assert.equal(c.dimensions, 1536);
  assert.equal(
    formatRetrievalInput("nginx", "QUERY"),
    "task: search result | query: nginx",
  );
  assert.equal(
    formatRetrievalInput("nginx", "DOCUMENT", "OCI"),
    "title: OCI | text: nginx",
  );
  assert.throws(() => embeddingConfig({ EMBEDDING_DIMENSIONS: "0" }));
});
test("provider maps independent inputs to independent responses and preserves partial failure", async () => {
  const calls = [];
  const client = {
    models: {
      embedContent: async (p) => {
        calls.push(p);
        if (p.contents.parts[0].text.includes("bad")) throw { status: 429 };
        return { embeddings: [{ values: [1, 0, 0] }] };
      },
    },
  };
  const provider = new GoogleEmbeddingProvider(
    { ...embeddingConfig({}), dimensions: 3 },
    client,
  );
  const result = await provider.embed(
    [
      { content: "good", title: "OCI" },
      { content: "bad", title: "OCI" },
    ],
    "DOCUMENT",
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].config.outputDimensionality, 3);
  assert.equal(calls[0].config.taskType, undefined);
  assert.equal(result[0].ok, true);
  assert.equal(result[1].ok, false);
  assert.equal(result[1].error.retryable, true);
});
test("invalid vectors and retry exhaustion cannot become successful embeddings", () => {
  for (const v of [[0, 0], [NaN, 1], [Infinity, 1], [1]])
    assert.throws(() => validateVector(v, 2));
  assert.deepEqual(validateVector([1, 0], 2), [1, 0]);
  assert.equal(retryPolicy({ retryable: false }, 1, 5).status, "FAILED");
  assert.equal(retryPolicy({ retryable: true }, 5, 5).status, "FAILED");
  assert.equal(retryPolicy({ retryable: true }, 1, 5).status, "PENDING");
});

test("installed Google SDK emits the documented Vertex embedContent wire format with file auth", async t => {
  const dir = await mkdtemp('/tmp/pm-embedding-auth-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = `${dir}/token.json`;
  await writeFile(path, JSON.stringify({ access_token: 'fixture-embedding', expiry_date: Date.now() + 120_000 }), { mode: 0o600 });
  const { GoogleGenAI } = await import("@google/genai");
  const requests = [];
  const client = new GoogleGenAI({
    vertexai: true,
    project: "test-project",
    location: "us",
    googleAuthOptions: {
      authClient: createGoogleRuntimeAuth({ GOOGLE_ACCESS_TOKEN_FILE: path }),
    },
    httpOptions: {
      apiVersion: "v1",
      retryOptions: { attempts: 1 },
      fetch: async (url, init) => {
        assert.equal(new Headers(init.headers).get('authorization'), 'Bearer fixture-embedding');
        requests.push({ url: String(url), body: JSON.parse(init.body) });
        return new Response(
          JSON.stringify({ embedding: { values: [1, 0, 0] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  });
  const provider = new GoogleEmbeddingProvider(
    { ...embeddingConfig({}), dimensions: 3 },
    client,
  );
  const result = await provider.embed(
    [{ content: "서버 구조", title: "OCI" }],
    "DOCUMENT",
  );
  assert.equal(result[0].ok, true);
  assert.match(
    requests[0].url,
    /^https:\/\/aiplatform\.us\.rep\.googleapis\.com\/v1\/projects\/test-project\/locations\/us\/publishers\/google\/models\/gemini-embedding-2:embedContent$/,
  );
  assert.equal(
    requests[0].body.content.parts[0].text,
    "title: OCI | text: 서버 구조",
  );
  assert.equal(requests[0].body.embedContentConfig.outputDimensionality, 3);
  assert.equal(requests[0].body.embedContentConfig.taskType, undefined);
});
