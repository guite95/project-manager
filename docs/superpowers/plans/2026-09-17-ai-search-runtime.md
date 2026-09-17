# AI search runtime implementation plan

**Goal:** Activate pgvector, OCI runtime WIF, initial embeddings and incremental processing.

**Architecture:** PostgreSQL 16 extension artifacts are built from the current pinned image; existing data volumes stay intact. OCI rotating instance certificates authenticate through a subject-restricted GCP X.509 WIF provider. The existing Google SDK reads runtime-only certificate files and impersonates the embedding service account. The existing durable worker runs under systemd.

**Spec:** `docs/ai-search.md` and the user's request to complete all remaining server work.

## Execution

- [ ] Build pinned pgvector 0.8.1 artifacts, back up the shared DB, install extension files and persistent mounts without replacing data.
- [ ] Create subject-restricted X.509 WIF and service-account binding; verify fresh credentials from OCI without local ADC.
- [ ] Install runtime certificate renewal, read-only app mount, and a periodic embedding worker.
- [ ] Run local focused tests, typecheck and build; commit, push and deploy authorized changes.
- [ ] Run backfill and drain current jobs; verify no failed/pending active embeddings, HNSW and real hybrid search.
- [ ] Record deployment evidence and operational renewal/recovery procedures.
