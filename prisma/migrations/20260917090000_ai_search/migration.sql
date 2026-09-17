-- Raw data remains authoritative. This migration needs no optional extensions.
ALTER TABLE ai_ops_session ADD COLUMN search_revision BIGINT NOT NULL DEFAULT 0;
CREATE FUNCTION ai_ops_bump_message_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.body,NEW.role,NEW.model,NEW.occurred_at,NEW.session_id) IS NOT DISTINCT FROM
     ROW(OLD.body,OLD.role,OLD.model,OLD.occurred_at,OLD.session_id) THEN RETURN NEW; END IF;
 END IF;
 IF TG_OP IN ('UPDATE','DELETE') THEN
  UPDATE ai_ops_session SET search_revision=search_revision+1 WHERE id=OLD.session_id;
 END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.session_id<>OLD.session_id) THEN
  UPDATE ai_ops_session SET search_revision=search_revision+1 WHERE id=NEW.session_id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER ai_ops_message_search_revision AFTER INSERT OR UPDATE OR DELETE ON ai_ops_message
 FOR EACH ROW EXECUTE FUNCTION ai_ops_bump_message_revision();
CREATE FUNCTION ai_ops_bump_session_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.title,NEW.cwd) IS DISTINCT FROM ROW(OLD.title,OLD.cwd) THEN NEW.search_revision=OLD.search_revision+1; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_ops_session_search_revision BEFORE UPDATE ON ai_ops_session
 FOR EACH ROW EXECUTE FUNCTION ai_ops_bump_session_revision();
CREATE INDEX ai_ops_message_fts_idx ON ai_ops_message USING gin(to_tsvector('simple',coalesce(body,'')));
ALTER TABLE ai_ops_message ADD CONSTRAINT ai_ops_message_id_session_key UNIQUE(id,session_id);

CREATE TABLE ai_ops_search_state (
 session_id TEXT PRIMARY KEY REFERENCES ai_ops_session(id) ON DELETE CASCADE ON UPDATE CASCADE,
 indexed_revision BIGINT NOT NULL, chunk_version TEXT NOT NULL, indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ai_ops_search_document (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES ai_ops_session(id) ON DELETE CASCADE ON UPDATE CASCADE,
 message_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN ('CHUNK','SESSION_SUMMARY','TOPIC_SUMMARY')),
 chunk_index INTEGER NOT NULL CHECK(chunk_index>=0),
 chunk_version TEXT NOT NULL, source_revision BIGINT NOT NULL,
 title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 chars INTEGER NOT NULL CHECK(chars>=0), content_type TEXT NOT NULL,
 searchable BOOLEAN NOT NULL, embedding_enabled BOOLEAN NOT NULL,
 importance REAL NOT NULL CHECK(importance BETWEEN 0 AND 1), metadata JSONB NOT NULL DEFAULT '{}',
 search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple',content)) STORED,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(message_id,session_id) REFERENCES ai_ops_message(id,session_id) ON DELETE CASCADE ON UPDATE CASCADE,
 CHECK((kind='CHUNK')=(message_id IS NOT NULL)),
 UNIQUE(id,content_hash)
);
CREATE INDEX ai_ops_search_document_session_idx ON ai_ops_search_document(session_id,kind);
CREATE INDEX ai_ops_search_document_fts_idx ON ai_ops_search_document USING gin(search_vector);
CREATE TABLE ai_ops_embedding_profile (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, dimensions INTEGER NOT NULL CHECK(dimensions BETWEEN 1 AND 16000),
 version TEXT NOT NULL, input_version TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(provider,model,dimensions,version,input_version), UNIQUE(id,dimensions)
);
-- One durable job/cache entry per embedding space and exact input content.
CREATE TABLE ai_ops_embedding_job (
 profile_id TEXT NOT NULL REFERENCES ai_ops_embedding_profile(id) ON DELETE CASCADE ON UPDATE CASCADE,
 content_hash TEXT NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), title TEXT NOT NULL, content TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SUCCESS','FAILED')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 lease_token TEXT, lease_until TIMESTAMPTZ, error_code TEXT, embedded_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(profile_id,content_hash)
);
CREATE INDEX ai_ops_embedding_job_pending_idx ON ai_ops_embedding_job(profile_id,status,available_at);
CREATE TABLE ai_ops_document_embedding (
 document_id TEXT NOT NULL, profile_id TEXT NOT NULL, content_hash TEXT NOT NULL,
 PRIMARY KEY(document_id,profile_id),
 FOREIGN KEY(document_id,content_hash) REFERENCES ai_ops_search_document(id,content_hash) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,content_hash) REFERENCES ai_ops_embedding_job(profile_id,content_hash) ON DELETE CASCADE
);
CREATE INDEX ai_ops_document_embedding_cache_idx ON ai_ops_document_embedding(profile_id,content_hash);
