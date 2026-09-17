import { GoogleGenAI } from "@google/genai";
import { digest } from "./chunks.mjs";
/**
 * EmbeddingProvider contract: config (provider/model/dimensions/version/id),
 * embed([{content,title}], 'QUERY'|'DOCUMENT') -> ordered per-item results.
 * Alternative providers implement this contract; no provider logic lives in SQL.
 */
export function embeddingConfig(env = process.env) {
  const config = {
    provider: env.EMBEDDING_PROVIDER || "google",
    model: env.EMBEDDING_MODEL || "gemini-embedding-2",
    dimensions: Number(env.EMBEDDING_DIMENSIONS || 1536),
    version: env.EMBEDDING_VERSION || "1",
    inputVersion: "retrieval-1",
  };
  if (
    !Number.isInteger(config.dimensions) ||
    config.dimensions < 1 ||
    config.dimensions > 16000
  )
    throw new Error("Invalid embedding dimensions");
  for (const value of [config.provider, config.model, config.version])
    if (!/^[a-zA-Z0-9._:/-]{1,160}$/.test(value))
      throw new Error("Invalid embedding profile");
  return {
    ...config,
    id: digest(JSON.stringify(config)),
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.GOOGLE_CLOUD_LOCATION || "us",
  };
}
export function formatRetrievalInput(content, role, title = "none") {
  if (role === "QUERY") return `task: search result | query: ${content}`;
  if (role !== "DOCUMENT") throw new Error("Invalid embedding role");
  return `title: ${title || "none"} | text: ${content}`;
}
export function validateVector(value, dimensions) {
  if (
    !Array.isArray(value) ||
    value.length !== dimensions ||
    value.some((v) => !Number.isFinite(v) || Math.abs(v) > 3.4e38) ||
    !value.some((v) => v !== 0)
  )
    throw new EmbeddingError("INVALID_VECTOR", false);
  return value;
}
export class EmbeddingError extends Error {
  constructor(code, retryable) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}
export function providerError(error) {
  if (error instanceof EmbeddingError) return error;
  const status = Number(error?.status ?? error?.code);
  if (status === 429) return new EmbeddingError("RATE_LIMIT", true);
  if (status >= 500 && status <= 599)
    return new EmbeddingError("UPSTREAM_UNAVAILABLE", true);
  if (
    [408, 504].includes(status) ||
    ["AbortError", "TimeoutError"].includes(error?.name)
  )
    return new EmbeddingError("TIMEOUT", true);
  if ([400, 401, 403, 404].includes(status))
    return new EmbeddingError(`UPSTREAM_${status}`, false);
  return new EmbeddingError("PROVIDER_FAILURE", true);
}
export function retryPolicy(
  error,
  attempt,
  maxAttempts = 5,
  random = Math.random,
) {
  return {
    status: !error.retryable || attempt >= maxAttempts ? "FAILED" : "PENDING",
    delaySeconds:
      Math.min(3600, 15 * 2 ** Math.min(attempt - 1, 8)) *
      (0.8 + random() * 0.4),
  };
}
export class GoogleEmbeddingProvider {
  constructor(config = embeddingConfig(), client) {
    this.config = config;
    if (
      !client &&
      (!config.project ||
        config.provider !== "google" ||
        config.model !== "gemini-embedding-2")
    )
      throw new EmbeddingError("PROVIDER_CONFIGURATION", false);
    this.client =
      client ??
      new GoogleGenAI({
        vertexai: true,
        project: config.project,
        location: config.location,
        httpOptions: {
          apiVersion: "v1",
          timeout: 30000,
          retryOptions: { attempts: 1 },
        },
      });
  }
  async embed(inputs, role) {
    // Vertex embedContent supports one Content per request (SDK 2.23.0).
    // The worker bounds batch size/concurrency; never aggregate unrelated chunks.
    return Promise.all(
      inputs.map(async (input) => {
        try {
          const text = formatRetrievalInput(input.content, role, input.title);
          if (Buffer.byteLength(text) > 8000)
            throw new EmbeddingError("INPUT_TOO_LONG", false);
          const response = await this.client.models.embedContent({
            model: this.config.model,
            contents: { parts: [{ text }] },
            config: {
              outputDimensionality: this.config.dimensions,
              abortSignal: AbortSignal.timeout(30000),
            },
          });
          if (
            response.embeddings?.length !== 1 ||
            response.embeddings[0].statistics?.truncated
          )
            throw new EmbeddingError("INVALID_RESPONSE", false);
          return {
            ok: true,
            vector: validateVector(
              response.embeddings[0].values,
              this.config.dimensions,
            ),
          };
        } catch (error) {
          return { ok: false, error: providerError(error) };
        }
      }),
    );
  }
}
export function createEmbeddingProvider(config = embeddingConfig()) {
  if (config.provider === "google") return new GoogleEmbeddingProvider(config);
  throw new EmbeddingError("UNSUPPORTED_PROVIDER", false);
}
