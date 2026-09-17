# AI search runtime implementation plan

**Goal:** Activate pgvector, OCI runtime WIF, initial embeddings and incremental processing.

**Architecture:** PostgreSQL 16 extension artifacts are built from the current pinned image; existing data volumes stay intact. OCI rotating instance certificates authenticate through a subject-restricted GCP X.509 WIF provider. The existing Google SDK reads runtime-only certificate files and impersonates the embedding service account. The existing durable worker runs under systemd.

**Spec:** `docs/ai-search.md` and the user's request to complete all remaining server work.

## Execution

- [x] Build pinned pgvector 0.8.1 artifacts, back up the shared DB, install extension files and persistent mounts without replacing data.
- [x] Create subject-restricted X.509 WIF and service-account binding; verify fresh credentials from OCI without local ADC.
- [x] Install runtime certificate renewal, read-only app mount, and a periodic embedding worker.
- [x] Run local focused tests, typecheck and build; commit, push and deploy authorized changes.
- [x] Run backfill and drain current jobs; verify no failed/pending active embeddings, HNSW and real hybrid search.
- [x] Record deployment evidence and operational renewal/recovery procedures.

## Verified operation (2026-09-17)

- App image `f09e78b7b455f7e5c7271a9dafa2c8c3bdf2b4b4`; deployment run
  https://github.com/guite95/project-manager/actions/runs/35206760078 succeeded.
- pgvector 0.8.1 installed without restarting shared PostgreSQL. Pre-change custom backup
  `backups/pre-pgvector-20260917T094456Z.dump`, SHA-256
  `f32236466d6cd19eb7393cc88ec15a97f4b86cfd0a1dd78d35a5b1edd66bfa19`.
- 595 sessions / 35,191 messages observed. After initial drain: 39,920 derived documents,
  36,525 active successful embeddings; zero active pending/processing/failed jobs and
  zero pending sessions. Counts change with live collection; inactive jobs are reusable cache.
- Real authenticated hybrid searches for OCI architecture and JWT refresh tokens returned
  HTTP 200, five messages/context items each and no fallback. FTS GIN and 1536 HNSW
  indexes are valid and ready. This is a runtime smoke check, not judged relevance evaluation.
- OCI intermediate certificates rotate frequently. Replaced the initial intermediate pin
  with the official authenticated regional root, verified the full chain, and confirmed
  new token exchange and 1536-dimensional API output with root-only WIF trust.
- Certificate renewal and incremental worker units returned success; their timers and
  boot recovery unit are enabled. No personal ADC or service-account private key is on OCI.
- Python certificate tests: six pass, including intermediate rotation and untrusted-chain
  rejection. Provider tests, typecheck and build passed. Browser verification was not run.
