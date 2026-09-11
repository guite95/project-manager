# Shared flow database implementation plan

**Goal:** Store the current flow catalog in PostgreSQL JSONB and use the server project database from both deployed and local apps.

**Architecture:** Project and category metadata and ordered chart rows live in PostgreSQL. Each chart contains its complete FlowChart JSON document and an optimistic revision. The TNS ERD snapshot also lives in the database. Existing TS definitions remain historical import fixtures only. Server rendering reads live data; client navigation receives DB data as props. SSH forwards a loopback-only port and injects the existing server DB credential into child process memory.

**Tech stack:** Existing Next.js, Prisma/PostgreSQL, React Flow, OpenSSH and Node; no new dependencies.

**Constraints:** Preserve existing board data and migration history. No public DB port, copied production secret, implicit data replacement, push or deployment. Tests use an explicitly local test database; shared database commands cannot reset it. The user's approved scope is the entire project DB. SSH target was provided directly by the user.

- [x] Add tests for malformed chart JSON, broken references, duplicate IDs, shared/test DB isolation, DB reads and concurrent updates.
- [x] Add relational catalog models plus JSONB chart documents; generate one additive migration containing a frozen import of all current charts and ERD metadata.
- [x] Replace all runtime registry imports in pages, sidebar, board and history. Keep URL helpers pure and dynamic server reads uncached across requests. Retain ERD drill-down with the DB snapshot.
- [x] Provide JSON GET/PUT for charts, validating payloads and rejecting stale revisions. Preserve existing login controls.
- [x] Add a shared DB command wrapper: strict host verification, loopback tunnel, owned-process cleanup, runtime-only credentials, local login and localhost binding. Keep explicit local-only dev and test commands.
- [x] Compare local/server business rows read-only and preserve local data; apply additive migration after a server backup, then verify counts and chart documents. Do not silently reconcile conflicting business rows.
- [x] Run focused tests, complete suite, typecheck and production build. Verify server-rendered DB chart data and refresh after an edit on the isolated test DB. Clean up owned servers/tunnels/browser artifacts.
- [x] Update README, deployment and chart authoring documentation with shared DB and JSON update instructions and exact verification limits.


## Verification evidence

- Whole suite: 139 passed; typecheck and production build passed.
- Shared server: migration applied; all 28 chart documents and 172-model ERD snapshot equal the source fixtures. Verified in a read-only transaction through the personal SSH tunnel as the app role.
- Browser against isolated local test DB: login gate 401, HR chart 10 rendered nodes including groups / 6 edges; JSON save 200, stale revision 409, invalid graph 400, foreign origin 403; refresh updates heading/sidebar/node text. Restored the test chart document afterward.
- ERD browser: organization chart rendered; employee table selection displayed all 23 columns. Full catalog contains 2 projects and 28 charts.
- The user chose server-authoritative data and preservation of the old local DB. Local-only issue/history rows were not merged.
- Application commit, push and deployed-container replacement are not included in this run's authorization. The DB migration is additive and compatible with the old deployed app.

- Shared local app: unauthenticated API 401, authenticated catalog and HR SSR 200, 28 charts. Owned servers and SSH tunnel stopped; ports 30001/30009/15435 had no remaining listener.
- Independent read-only code review found no critical/important issues. Fixed the minor remote-port validation issue and added occupied-port/destructive-command regression checks.
