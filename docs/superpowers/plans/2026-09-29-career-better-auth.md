# Career Better Auth Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User approved the design and explicitly requested implementation without another approval gate.

**Goal:** Existing OWNER login authorizes ChatGPT career MCP without Auth0, Kakao, or a second password.

**Architecture:** Preserve PM accounts and MCP transport. Better Auth 1.7.6 and OAuth Provider 1.7.6 issue ES256 resource-bound tokens. Each authorization-server request runs under an existing OWNER row lock and a Prisma transaction; an OWNER-only session bridge and epoch-bound grants prevent resurrection after revocation.

**Tech Stack:** Next.js 16, Prisma 7/PostgreSQL, Better Auth 1.7.6, jose, existing MCP SDK v1.

**Spec:** `docs/superpowers/specs/2026-09-29-career-better-auth-design.md`

## Global Constraints

- No production DB reads/writes, deployment, commits, pushes, or hosted plugin updates in this implementation.
- P-Grid reading waived explicitly by the user; repository security rules remain enforced.
- Preserve existing uncommitted Jev improvements. Current workspace, separate local feature branch.
- Test DB must pass `assertTestDatabase`: localhost:5432/project_management_test only.
- No registration/social login/second password. Only configured real active OWNER; bootstrap denied.
- Public OAuth endpoints are exact-path/method allowlisted. Browser changes require same-origin checks.
- No token/private key/password body logs. Better Auth private signing keys encrypted with a runtime secret.

## Review Focus

1. Valid-looking but wrong host, callback, resource, client, duplicated parameters, or altered consent must fail before token issuance (tasks 1, 3).
2. Password-change/disconnect racing refresh must not resurrect old grants (tasks 2, 3).
3. A previously authorized browser cookie without the current PM OWNER session must not silently authorize new grants (task 3).
4. Refresh should work after ordinary web logout but not after revocation or absolute session expiry (tasks 2, 3).
5. Disabled/misconfigured auth must neither open public paths nor seed DB during build/metadata reads (tasks 1, 3, 4).

## Task 1: Configuration and HTTP policy

Files: `lib/career/oauth-policy.ts`, `lib/career/oauth-policy.test.mjs`.
Interfaces: `readOAuthConfig(env, secret)`, `oauthRouteKind(path,method)`, `validateOAuthQuery(query,config)` consumed by issuer and UI.

- [x] RED: tests reject invalid configuration, non-ChatGPT callbacks, unknown/duplicate OAuth parameters, missing PKCE, unauthorized scopes and route variants.
  ```js
  assert.throws(() => validateOAuthQuery(new URLSearchParams('client_id=other'), config));
  assert.equal(oauthRouteKind('/api/career-auth/sign-up/email', 'POST'), null);
  ```
- [x] GREEN: implement strict config/route/query validators; disabled returns null, incomplete enabled configuration throws without exposing values.
- [x] Verify: `node --experimental-strip-types --test lib/career/oauth-policy.test.mjs`.

## Task 2: Durable OAuth state and account revocation

Files: Prisma schema, forward migration, `lib/server/career-oauth-store.ts`, integration tests.
Interfaces: owner row lock, provider transaction client, `revokeCareerOAuth(ownerId)` and `assertCareerOAuthEpoch(ownerId,epoch)`.

- [x] RED: guarded local DB tests assert password/role/active changes invalidate prior epochs, preserving original account data; inactive/nonOWNER denied.
  ```js
  await changePassword(owner, oldPassword, nextPassword);
  await assert.rejects(() => assertCareerOAuthEpoch(owner.id, oldEpoch));
  ```
- [x] Generate exact provider persistence models from installed library schema, map to `career_oauth_*`, add owner epoch and SQL security-change trigger. Apply only to guarded test DB.
- [x] Implement row-locked revocation and epoch lookup; preserve unrelated tables, no production seeding.
- [x] Verify local integration tests and existing access tests.

## Task 3: Better Auth provider and existing-session bridge

Files: `lib/server/career-oauth.ts`, `lib/server/career-oauth.test.mjs`, runtime-secret reader, MCP auth tests.
Interfaces: `careerOAuthHttp(request)`, provider session bridge and consent endpoints, protected metadata and issuer/JWKS config.

- [x] RED: actual HTTP requests against real Better Auth handler exercise authorize→bridge→consent→PKCE exchange→refresh→MCP validation, using synthetic local OWNER.
  ```js
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.ok(tokens.access_token);
  assert.ok(tokens.refresh_token);
  await assert.rejects(() => verifyAfterDisconnect(tokens.access_token));
  ```
- [x] Implement provider factory per transaction, fixed registered client, encrypted ES256 key storage, signed login-context verification, epoch-bound sessions and claims.
- [x] Add browser-origin and existing OWNER-cookie enforcement for bridge/consent; reject deleted sessions and replayed login context.
- [x] Test invalid PKCE/code replay/refresh replay, callback/resource/scope tampering, concurrent revocation, missing secrets and disabled endpoints.
- [x] Integrate MCP epoch check without weakening existing external-JWT tests or per-tool OWNER validation.

## Task 4: Routes, UI, delivery documentation and verification

Files: precise OAuth route handlers, `proxy.ts`, `/career/connect`, `/career/consent`, local registration and disconnect controls, runtime/deployment docs and AGENTS.md.

- [x] Add route adapters and server-owned no-store responses; expose no account/client management endpoints.
- [x] Add login/consent UI using existing components. Keep existing `/api/login` behavior, resume a server-validated pending OAuth request, display actual approved scopes, disable repeat submissions.
- [x] Add OWNER-only connection revoke action. OAuth access consent remains distinct from Jev and save consent.
- [x] Run full suite, typecheck, build and real local HTTP smoke; browser remains opt-in.
- [x] One independent final security review; fix important findings with regression tests.
- [x] Update docs with config, schema deployment gate, verification evidence and known unverified production/ChatGPT steps. No commit/push/deploy.

## Execution ledger

- Baseline: 460 tests, 454 passed, 6 skipped, zero failures. No live calls.
- Ruling: preserve current dirty checkout on `feat/career-better-auth` rather than copy user changes to a new worktree; no commit authorized.
- Ruling: user explicitly waived P-Grid and requested direct implementation after spec approval; no additional plan-approval pause.
- Pre-flight: policy feeds issuer and UI; owner epoch feeds both grant issuance and MCP validation; revocation and issuer must lock the same account row.

- Task 1: strict policy RED→GREEN verified; exact client/callback/resource/S256/scope and route restrictions.
- Task 2: provider schema generated from installed 1.7.6 metadata. A local-only generation naming error was identified; only the newly created empty test tables were removed and recreated. Guarded test migration succeeds; Prisma diff against the resulting test DB is empty. No production DB access.
- Task 3: real provider integration exercises authorization, consent, ES256 JWT, MCP verification, refresh/logout, code/refresh replay, scope attenuation/escalation, security-change trigger, deadline and concurrent disconnect. Browser flow uses durable one-time pending state in addition to provider-signed consent.
- Task 4: exact public route adapters, login/consent/manage pages, opt-in Compose overlay and runtime-secret reader are implemented. Ruling: Compose/Vault activation and exact ChatGPT registration remain deployment gates; no fake OCIDs or automatic deploy changes.
- Final independent review: one Important finding in Next internal-versus-public URL origin handling. Added failing regression, fixed canonicalization only after Host/Origin checks, ignored forwarded-host. Reviewer verified resolution; no remaining Critical/Important findings. Minor revoke/JWT limitation documented and covered.
- Final fresh verification: 481 tests, 475 passed, 6 existing skips, zero failures; typecheck, build and git diff --check passed. Prisma migration diff is empty.
- Actual built Next HTTP smoke: discovery returns the external issuer, public JWKS reads, unauthenticated MCP returns 401 challenge, signup stays closed, missing-flow page renders safely, wrong Host is rejected. Used node:http because global fetch ignores a custom Host header. Owned Next server stopped.
- Declined-to-judge rulings: production migration/Vault/deployment/ChatGPT integration and browser behavior intentionally unverified; existing unrelated Jev work preserved. These are not local completion claims. No commit or push.

## Subsequent authorized server preparation

- User separately requested server preparation after local implementation. This supersedes the implementation-only production restriction only for DB backup/migration and Vault/IAM/runtime-secret preparation; app deployment, commit/push and hosted ChatGPT/plugin changes remain separate.
- Verified retained full DB backups, then used the dedicated migration identity/helper for the single approved migration. Live history 9→10; 13 empty OAuth tables, epoch trigger, unchanged original account fields and runtime DML privileges verified. The transient SQL-only migration artifact was removed; serving app image/PID/start time stayed unchanged.
- Created two pinned Vault Secrets and an exact-secret read policy under the existing host/egress boundary. Backed up and patched the host publisher's two-name allowlist plus runtime manifest; reloaded only the secret publisher and verified five protected files with the prior three values unchanged.
- Fresh full suite 475 pass/6 skip, Vault suite 20 pass/1 skip, typecheck/build passed. Independent bounded Vault review has no Critical/Important findings. Reviewer exclusions for live state were covered by the main agent's direct checks; OAuth integration/deployment remains deliberately pending.
- See `docs/career-oauth.md` and `docs/evidence/career-server-prep-2026-09-29.json` for retained backup checksums, live evidence and next delivery gates. No commit, push, application deployment or browser operation.
