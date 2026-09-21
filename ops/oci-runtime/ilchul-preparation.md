# Ilchul host Vault preparation (2026-09-21)

Scope: prepare the existing OCI VM without merging Ilchul PR #370, changing active
containers, switching traffic, retiring credentials or restarting shared services.

- Reuse existing DEFAULT Vault/software key. Three pinned v1 Secrets:
  ilchul-backend-config, ilchul-migration-config, redis-host-admin-config.
- IAM grants the existing VM identity only exact Secret bundle reads behind the
  existing egress network source. This is host identity, not container IAM isolation.
- MySQL runtime CRUD and migration DDL/backup are scoped to ilchul_db. Runtime has
  no DDL/global/grant privilege; schema-wide CRUD intentionally also covers future
  migration-created tables. It is not row-level isolation of migration history.
- MinIO principal can read/write/delete/list ilchul only; root and existing public
  policy unchanged. Synthetic probe objects are deleted immediately after tests.
- Named Redis ACL administrator remains root-only. Application mounts never
  include it. Shared default nopass remains an explicit temporary exception until
  old Ilchul is retired after user acceptance; do not close it during preparation.
- Legacy/running apps are not modified by the new supervisor. Stopped active
  Vault backends require publication, preflight and forced recreation using the
  original immutable images/project. Retry publication after transient failures.
- New DB/Redis/MinIO passwords are unavoidable service-local static credentials,
  owned by the service operator, Vault-managed; review/rotate at most every 90 days
  and immediately on suspected exposure. No new cloud/SSH/API key was created.
  The operator input file is retained ignored/0600 at the user's explicit request.

## Evidence before host installation

- MySQL backup: /var/backups/ilchul-vault/prepare-20260921T071232669028Z.sql.gz;
  gzip integrity and SHA256 recorded, 18 current tables. Separate restore remains pending.
- Two new MySQL accounts created; exact schema grants verified; old accounts retained.
- MinIO real write/read/list/delete and admin denial verified. ListBuckets returns
  the allowed bucket only, rather than failing; no other buckets were listed.
- Java Redis configuration bug fixed in Ilchul PR revision 9162cf8; 213 backend tests
  passed. Both PR CI jobs passed in run 35572034716. PR remains unmerged.
- Host tests, PM typecheck/build passed. Host live verification follows installation.

## Installation and readiness

Commit/push host code to PM main with `[skip ci]` (no PM app deploy), stage the fixed
host release, then run install-ilchul-runtime.mjs. Ilchul host utility/Compose copies
come from the pushed PR revision, are root-owned, and record the source revision.
They do not deploy that PR. This preparatory exception must be replaced/reviewed
when the approved PR reaches main or its host contracts change.

The installer deliberately writes all readiness checks false. Only record checks
after concrete verification. No whole-VM reboot is performed. Recovery simulations,
actual VM reboot, and actual application cutover must be reported separately.

Before merge: check new-account authentication/negative privileges, real Vault
publisher permissions and failed reload preservation, Redis application operations,
metadata blocking, root-only migration backup/restore, boot recovery rehearsal,
public settings, sudo path and rollback inventory. GitHub production/main/guite95
approval configuration has been read back successfully.
