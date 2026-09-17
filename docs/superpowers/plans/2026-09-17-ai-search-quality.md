# AI search quality implementation plan

**Goal:** Improve retrieval using versioned content interpretation, conversation context and measured relevance while preserving raw history and known relevant sessions.

**Architecture:** Keep PostgreSQL/FTS/pgvector and the provider adapter. Add provenance to incoming messages; store explainable block classifications and question/answer links in existing derived-document metadata. Rebuild derived documents and reuse content-addressed vectors. Merge independent candidate lists by rank, then select evidence-backed results and return exact source citations. Evaluate fixed historical queries and labelled sessions before and after rollout.

**Approved scope:** The four-part design in conversation: original/interpretation separation, conversation context, candidate/final relevance separation, regression evaluation. Existing commit/push/deploy/backfill authorization continues. Execute inline; no extra infrastructure or automatic source deletion.

## Tasks

1. Baseline: inspect evidence for positive sessions; save a private fixed-date evaluation dataset with development/holdout queries and negative cases. Record baseline per-query hits, MRR/nDCG and noise; never commit original bodies/IDs.
2. Interpretation: implement a versioned block classifier. Use source event/channel metadata and explicit provider envelopes; preserve quoted/fenced examples and mixed user text. Unknown prose stays searchable; heuristic low-value content receives lower weight, not deletion. Persist reason/evidence per block and exact offsets. Test mixed blocks, code fences, tool errors and unknown content.
3. Provenance: add one forward migration for a bounded JSONB message source descriptor, update parser/ingest/Prisma and replay semantics without overwriting saved bodies. Future collector traffic must continue excluding tool/system/reasoning originals. Existing records remain marked legacy.
4. Conversation documents: connect assistant chunks to the nearest actual question in the same session with source IDs/offsets; use local conversational context instead of the mutable global session title. Build summaries from substantive conversation blocks. Preserve raw document identity and cache recoverability via versioned derived metadata.
5. Retrieval: keep lexical, global-vector and scoped-vector rankings independent; use shared classification on fallback paths. Rank candidates using explicit lexical/vector evidence, configurable model-specific semantic floor, exact duplicate grouping and a soft diversity preference. Fetch permitted linked context with original citations. No result padding or hard session cap. Keep literal search for exact investigation.
6. Evaluation: reusable private JSON dataset + machine-readable report, fixed date filters, per-query evidence, positive and no-answer metrics; compare baseline with candidate and block known-positive regressions. Calibrate on development queries, report holdout separately. Do not call this exhaustive recall measurement.
7. Verify: focused unit and guarded local DB tests, Prisma validation, typecheck/build. Backup before forward migration/reindex, deploy, complete jobs, compare live evaluation, inspect API/citations and timer health. Browser testing remains opt-in.
