CREATE TABLE ai_ops_device (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, last_sync_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 root_count INTEGER NOT NULL DEFAULT 0 CHECK(root_count >= 0), files INTEGER NOT NULL DEFAULT 0 CHECK(files >= 0), errors INTEGER NOT NULL DEFAULT 0 CHECK(errors >= 0)
);
CREATE TABLE ai_ops_session (
 id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES ai_ops_device(id) ON DELETE CASCADE ON UPDATE CASCADE,
 source TEXT NOT NULL CHECK(source IN ('CODEX','CLAUDE_CODE')), external_id TEXT NOT NULL,
 cwd TEXT NOT NULL, title TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL, last_active_at TIMESTAMPTZ NOT NULL,
 UNIQUE(device_id,source,external_id)
);
CREATE INDEX ai_ops_session_active_idx ON ai_ops_session(last_active_at DESC,id);
CREATE TABLE ai_ops_message (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES ai_ops_session(id) ON DELETE CASCADE ON UPDATE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('USER','ASSISTANT')), model TEXT, occurred_at TIMESTAMPTZ NOT NULL,
 body TEXT, chars INTEGER NOT NULL CHECK(chars >= 0)
);
CREATE INDEX ai_ops_message_session_time_idx ON ai_ops_message(session_id,occurred_at,id);
CREATE INDEX ai_ops_message_time_idx ON ai_ops_message(occurred_at);
CREATE TABLE ai_ops_usage (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES ai_ops_session(id) ON DELETE CASCADE ON UPDATE CASCADE,
 model TEXT, occurred_at TIMESTAMPTZ NOT NULL,
 input_tokens BIGINT CHECK(input_tokens >= 0), cache_read_tokens BIGINT CHECK(cache_read_tokens >= 0),
 cache_write_tokens BIGINT CHECK(cache_write_tokens >= 0), output_tokens BIGINT CHECK(output_tokens >= 0),
 reasoning_tokens BIGINT CHECK(reasoning_tokens >= 0), total_tokens BIGINT CHECK(total_tokens >= 0)
);
CREATE INDEX ai_ops_usage_session_time_idx ON ai_ops_usage(session_id,occurred_at,id);
CREATE INDEX ai_ops_usage_time_idx ON ai_ops_usage(occurred_at);
