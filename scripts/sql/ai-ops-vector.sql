-- Explicit optional capability, NOT part of startup migrate deploy.
-- DBA: install pgvector >= 0.8 extension files first; inspect and back up before applying.
-- Run as a transaction after 20260917090000_ai_search. See docs/ai-search.md.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS ai_ops_embedding_vector (
 profile_id TEXT NOT NULL, content_hash TEXT NOT NULL, dimensions INTEGER NOT NULL,
 embedding vector NOT NULL,
 PRIMARY KEY(profile_id,content_hash),
 FOREIGN KEY(profile_id,content_hash) REFERENCES ai_ops_embedding_job(profile_id,content_hash) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,dimensions) REFERENCES ai_ops_embedding_profile(id,dimensions) ON DELETE CASCADE,
 CHECK(vector_dims(embedding)=dimensions), CHECK(vector_norm(embedding)>0)
);
CREATE INDEX IF NOT EXISTS ai_ops_embedding_vector_hnsw_1536_idx
 ON ai_ops_embedding_vector USING hnsw ((embedding::vector(1536)) vector_cosine_ops)
 WHERE dimensions=1536;
