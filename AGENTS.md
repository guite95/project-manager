# Project management

- Company project recordings use `project_recording` and separate `recording_transcript` rows. Originals stay in private OCI `recordings/` objects; Chirp 3 uses the existing embedding ADC/WIF identity and a private GCS staging bucket. Keep Google operation IDs durable, use DB-time leases, never blindly resubmit ambiguous requests, and clean staging only after the transcript transaction succeeds. See `docs/recordings.md`. Shared DB migration, IAM/bucket setup, and deployment are separate operations.

## Data and runtime

- Flowcharts are stored in PostgreSQL: `flow_project`, `flow_category`, and `flow_document.document` (JSONB). Navigation and overview read lightweight summaries from `lib/server/flow-catalog-store.ts`; chart detail reads only the selected document through `lib/server/flows-store.ts`.
- `lib/flows/initial-catalog.ts`, the original chart TS files, and `lib/erd/tns-schema.json` are historical migration/test fixtures. Editing them does not update live charts. Use validated JSON writes with revision checks for ordinary charts.
- ERD drill-down reads `app_setting` key `erd:tns`. Update this snapshot and its derived chart documents together; the ordinary chart PUT deliberately rejects ERD edits.
- ERD positions, groups, ports, and edge paths are authoritative JSON in `app_setting` keys `erd:tns:layout:domain:<domain>` and `erd:tns:layout:table:<table>`. Reads never generate or save layouts. `scripts/erd-layouts.mjs inspect/apply` initializes missing layouts with a snapshot hash, revision, inspection token, verified backup, and transaction; it preserves existing layouts. Snapshot changes require an explicit layout refresh as well. Browser verification is skipped unless the user explicitly requests it.
- The user explicitly chose to share the entire project database between local and deployed apps. `pnpm dev` opens a personal SSH tunnel and uses the server DB. `pnpm dev:local` explicitly uses the preserved local DB.
- Existing local-only business rows must not be silently merged, deleted, or overwritten when switching DB targets.
- UI preferences use shared `app_setting` keys: `ui:navigation` (panel collapse), `ui:reference-columns` (column visibility/order/width), and the existing `sidebar:project-order` and `board`. Do not introduce localStorage writers for preferences. Legacy browser column preferences import only when the shared key is absent; existing DB preferences take priority.
- UI preference PATCH writes merge only changed fields with compare-and-swap retries. GET is read-only; keys are created on first change, without a schema migration. Navigation preferences and column preferences refresh on focus and every 15 seconds while visible.

## Database changes and security

- Account access uses `access_user/session/membership/share/audit/throttle`. Administrators directly issue active accounts with an initial password; OWNER alone can create ADMIN accounts. The retired `access_invite` table remains for history only; never consume existing invitations. OWNER alone can access personal projects, AI activity and owner workspace data; ADMIN manages company projects; MEMBER receives VIEWER/EDITOR per project. Delete is separate from editor rights and requires OWNER/ADMIN. Never restore the development login bypass.
- `proxy.ts` enforces default-owner route policy and same-origin mutations; normalize URL-encoded path segments before evaluating IDs. Catalog APIs and workspace navigation must filter by the current DB-backed actor. Never trust client role/identity headers. Account APIs additionally validate their own actor.
- Legacy signed sessions and the shared password are accepted only before the first OWNER is registered. Session issuance locks the user row and compares the verified password hash so password/permission revocation cannot race with login. Share tokens are stored only as hashes. Public share links resolve exactly one non-personal document, never the whole project or TNS ERD snapshot. See `docs/account-access.md` for rollout and verification.

- Read-only inspection precedes live DB changes. Back up before migration; applied migrations remain immutable. Use forward migrations and `migrate deploy` for the shared server DB.
- Never run reset, `migrate dev`, `db push`, or integration tests against the shared DB. Tests are limited to local `localhost:5432/project_management_test` and guarded in `lib/test-database.ts`.
- Keep PostgreSQL private/loopback-only. Use personal SSH authentication and strict known-host verification. Do not expose a public DB port or share private keys.
- The tunnel wrapper reads the existing server app credential over SSH into child-process memory. Never print or persist it locally. `.env` may contain the existing local credentials and non-secret SSH metadata; do not copy production credentials into it.
- Read the current P-Grid `security-principles` manual before security/infrastructure changes. Existing OCI deployment details are in `docs/deploy.md`; do not silently replace the infrastructure provider.
- A commit request does not authorize push or deployment. Stage exact paths; never add a Codex co-author trailer or generated-with-Codex PR footer.

## Verification and documentation

- Run meaningful focused tests, `pnpm typecheck`, and `pnpm build` for runtime changes. `pnpm test` uses only the local test DB.
- Report code checks, live DB verification, browser checks and deployed-app status separately.
- Close owned browser sessions and servers/tunnels. Remove temporary screenshots/snapshots; preserve user-owned processes.
- Document index: `README.md` (commands/data flow), `docs/deploy.md` (OCI operations), `app/(workspace)/guide/page.mdx` (JSON authoring), `lib/erd/README.md` (ERD snapshot), `docs/superpowers/plans/2026-09-11-shared-flow-db.md` (migration scope and verification).

- Project accordions start fully collapsed on desktop and mobile, with only one project open at a time. Expansion is transient; do not restore legacy DB project expansion keys.
- Write new comments in Korean or English; do not use Japanese.
- Imported Focus AI content lives in `flow_document.document.content` (schedule, ERD, slides, HTML, notice). `data/imports/focus-ai-2026-09-14.json` is an import snapshot, not a runtime source. WBS completion is a read-only snapshot, without upstream synchronization.
- Imported HTML must render only in a sandboxed iframe with a restrictive CSP; never render it in the application DOM or enable scripts/same-origin. Menu summaries must exclude content bodies and embedded assets.
- PDF/HTML materials and imported HTML/slides can store originals in private OCI Object Storage. `flow_document.document.content.storage` is a server-owned reference; readers restore and verify SHA-256 before parsing. Never accept client-supplied storage references. `scripts/material-storage.mjs prepare/copy/verify/compact` uses a verified backup and revision checks. Keep DB bodies until the OCI-compatible app is deployed. Deletion records an `app_setting` outbox job before removing the object; failed jobs remain retryable. See `docs/object-storage.md`.

- AI activity uses `ai_ops_device/session/message/usage`. It is private single-owner data behind explicit session validation, including in development. Mac Agent ingestion runs only through personal SSH into the container stdin command; no public write endpoint or new API credential. Collect all sessions in default, `.uk-private`, configured, and workspace-discovered log roots regardless of cwd. `~/uk` adds discovery roots; it does not restrict session cwd. Scope changes replay checkpoints with stable event IDs.
- AI bodies, session/message metadata, and usage are retained permanently at the owner's request. Do not add age-based deletion or read/search expiry. Never upload raw tool/system/reasoning contents. Use stable event identifiers and ACK-before-checkpoint for retries. Browser checks remain opt-in. See `docs/ai-ops.md`.

- Personal project membership is defined by exact IDs in `lib/personal-projects.ts`. They use existing flow tables with `personal-` IDs; notes are project-scoped `project_note` rows. Separate company/personal sidebar groups and overview lists, preserving both groups when changing shared project order. Personal `/flows/<slug>` pages keep the personal tab active. Register missing rows explicitly with `scripts/register-personal-projects.mjs` after inspection and backup; never seed on GET.
- Personal projects do not require GitHub token registration or repository linking. Local Git history and AI activity collection are independent of GitHub integration. Historical GitHub settings and OCI Secrets are not read by the app; removing the feature does not revoke tokens or delete external resources.

- AI search keeps raw `ai_ops_session/message/usage` authoritative. FTS uses PostgreSQL `simple`; derived chunks/extractive summaries, embedding jobs and profile-scoped cache live in `ai_ops_search_*`/`ai_ops_embedding_*`. No Elasticsearch. Default embeddings: Vertex AI `gemini-embedding-2`, 1536 dimensions, cosine. Gemini 2 retrieval uses query/document text instructions, not `task_type`.
- Embedding calls run outside raw ingestion transactions. Run `ai:search inspect` before explicit backfill/worker writes; indexed source revisions and leased jobs are durable checkpoints. Keep provider/model/dimensions/version/input version and content SHA-256 together; never search across embedding spaces. ADC/workload identity only, no new API key. Optional pgvector activation is SQL-owned in `scripts/sql/ai-ops-vector.sql`, outside automatic Prisma startup migrations; install extension files and back up first. See `docs/ai-search.md`.
