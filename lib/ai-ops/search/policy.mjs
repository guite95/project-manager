// 전처리 검증과 사용자의 재개 요청 전까지 원본 저장만 유지한다.
export function embeddingsEnabled(env = process.env) {
  return env.AI_OPS_EMBEDDING_ENABLED === "true";
}
export function assertEmbeddingsEnabled() {
  if (!embeddingsEnabled()) {
    const error = new Error("EMBEDDING_PAUSED");
    error.code = "EMBEDDING_PAUSED";
    throw error;
  }
}
