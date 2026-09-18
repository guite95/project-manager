CREATE TABLE "project_recording" (
  "id" TEXT PRIMARY KEY,
  "project_slug" TEXT NOT NULL REFERENCES "flow_project"("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
  "title" TEXT NOT NULL CHECK (length(btrim("title")) BETWEEN 1 AND 200),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('CALL', 'OFFLINE', 'ONLINE', 'OTHER')),
  "context" TEXT NOT NULL DEFAULT '' CHECK (length("context") <= 1000),
  "file_name" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "byte_length" INTEGER NOT NULL CHECK ("byte_length" BETWEEN 1 AND 104857600),
  "storage" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_token" TEXT,
  "lease_until" TIMESTAMPTZ,
  "error" TEXT,
  "operation" TEXT,
  "staging" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "recording_lease_check" CHECK (("status" = 'PROCESSING') = ("lease_token" IS NOT NULL AND "lease_until" IS NOT NULL))
);
CREATE INDEX "project_recording_project_slug_created_at_idx" ON "project_recording"("project_slug", "created_at");
CREATE INDEX "project_recording_status_created_at_idx" ON "project_recording"("status", "created_at");
CREATE TABLE "recording_transcript" (
  "recording_id" TEXT PRIMARY KEY REFERENCES "project_recording"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "text" TEXT NOT NULL CHECK (length(btrim("text")) > 0),
  "language" TEXT NOT NULL,
  "engine" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
