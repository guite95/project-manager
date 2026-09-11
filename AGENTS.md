# Project management

## Data and runtime

- Flowcharts are stored in PostgreSQL: `flow_project`, `flow_category`, and `flow_document.document` (JSONB). Runtime pages and navigation read `lib/server/flows-store.ts`.
- `lib/flows/initial-catalog.ts`, the original chart TS files, and `lib/erd/tns-schema.json` are historical migration/test fixtures. Editing them does not update live charts. Use validated JSON writes with revision checks for ordinary charts.
- ERD drill-down reads `app_setting` key `erd:tns`. Update this snapshot and its derived chart documents together; the ordinary chart PUT deliberately rejects ERD edits.
- The user explicitly chose to share the entire project database between local and deployed apps. `pnpm dev` opens a personal SSH tunnel and uses the server DB. `pnpm dev:local` explicitly uses the preserved local DB.
- Existing local-only business rows must not be silently merged, deleted, or overwritten when switching DB targets.

## Database changes and security

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
- Document index: `README.md` (commands/data flow), `docs/deploy.md` (OCI operations), `app/guide/page.mdx` (JSON authoring), `lib/erd/README.md` (ERD snapshot), `docs/superpowers/plans/2026-09-11-shared-flow-db.md` (migration scope and verification).
