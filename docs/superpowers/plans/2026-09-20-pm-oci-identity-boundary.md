# PM OCI Identity Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PM 앱에서 OCI 개인키 없이 Object Storage와 Google AI를 사용할 수 있는 인증 경계를 구현하고 검증한다.

**Architecture:** Object Storage는 Unix socket으로 제한된 호스트 중계 서버에 요청한다. Google WIF 교환은 호스트에서 수행하고 앱에는 만료 시간이 있는 단기 access token 파일만 전달한다. 기존 운영 구성을 자동 전환하지 않고, 별도 Compose override와 설치 절차를 검증한 뒤 전환한다.

**Tech Stack:** Node.js ESM, node:test, existing oci-common/oci-objectstorage, google-auth-library, systemd, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-20-oci-vault-single-vm-design.md`, 하위 작업 A. B/C의 Vault 계정 회전은 이 경계의 운영 검증 이후 별도 구현 단위다.

**Execution status:** 사용자가 자격증명 입력이 필요한 지점 전까지 작업 재개를 승인했다. 입력 파일은 읽지 않고 합성 fixture로 구현·검증한다. 새 계정/비밀번호/Vault Secret 등록 전에 멈춘다. 전체 후속 순서는 `2026-09-20-oci-vault-rollout.md`를 따른다.

### 2026-09-21 실행 기록

사용자 추가 지시로 **인라인 실행**했다. 서브에이전트/독립 리뷰를 실행하지 않았다.
Task 1–3의 로컬 코드, 합성 fixture 테스트, host service/timer, opt-in Compose,
운영 전환 문서를 작성했다. 구현 검토 중 OCI SDK가 upstream 오류 메시지를 직접
로그로 출력하는 문제를 재현했고, HTTP 실패 본문을 SDK 전에 제거하는 회귀 테스트와
host unit 로그 제한을 추가했다.

범위 보완: client/host가 모두 검사하는 `object-storage-broker-protocol.mjs`,
실제 SDK transport 및 socket lifecycle을 검증하는 `host-runtime.test.mjs`를 추가했다.
아래 Task 2 예시에도 본문의 계약대로 `brokerReference`가 필요하다.

체크박스는 원래 작업 명세로 보존하며 다음 결과 표를 실행 상태의 기준으로 사용한다.

| 항목 | 상태 |
|---|---|
| Google file auth 및 임베딩/Chirp 연동 | 로컬 구현·테스트 완료 |
| 제한된 Object Storage Unix broker | 로컬 구현·테스트 완료 |
| host publisher/runtime 및 opt-in 배포 패키지 | 로컬 구현, 운영 미적용 |
| 집중 테스트/typecheck/build/diff-check | 최종 검증 기록은 `ops/oci-runtime/verification.md` 참조 |
| 실제 Docker Compose 병합 | 미검증: 로컬 Docker CLI 없음 |
| Linux systemd·OCI/Google 실제 호출·방화벽·재부팅 | 미검증/미적용 |
| main 통합·커밋·push·배포 | 수행하지 않음, 작업 브랜치 보존 |
| 자격증명 입력 파일 | 읽지 않음 |
| 새 계정·비밀번호·Vault Secret/IAM | 변경하지 않음 |

기본 배포는 기존 인증을 유지한다. 후속 재배포 유지에는 main의 Actions/부팅 게이트 변경과
실제 운영 검증이 추가로 필요하다. 이 패키지 작성만으로 Vault 이전 완료 또는 IMDS 차단 완료라고 보고하지 않는다.

## Global Constraints

- 비밀값을 대화, 명령 인수, 로그, 저장소, 새 영구 `.env`에 남기지 않는다.
- 자료 16MiB, 녹음 100MiB 상한, hash 검증, PUT ifNoneMatch 및 삭제 outbox를 보존한다.
- 앱에 OCI 토큰/인스턴스 개인키, Google refresh token/장기 키를 반환하지 않는다.
- Unix socket만 사용한다. TCP listener, 임의 URL 프록시, 임의 버킷/범용 서명/Vault API 없음.
- 새 Vault 권한은 신원 분리의 운영 검증 전에 부여하지 않는다.
- 공유 DB 테스트/reset/migration, 브라우저 검증, 서버 변경, push/deploy는 이 로컬 구현 단위에서 수행하지 않는다.
- 사용자 선택에 따라 현재 폴더의 `security/oci-vault-migration-20260920` 브랜치를 사용한다. main을 변경하지 않는다.
- 새 장기 자격증명/불필요한 의존성을 만들지 않는다. 커밋에 Codex co-author를 넣지 않는다.

## Task 1: Google 단기 토큰 파일 인증

**Files:**
- Create: `lib/server/google-runtime-auth.mjs`, `lib/server/google-runtime-auth.test.mjs`
- Modify: `lib/ai-ops/search/provider.mjs`, `lib/ai-ops/search/provider.test.mjs`, `lib/server/chirp-transcription.mjs`, `lib/server/chirp-transcription.test.mjs`

**Interfaces:**
- Produces `createGoogleRuntimeAuth(env = process.env)`: Google SDK auth client compatible with both `getRequestHeaders()` and `request(options)`.
- Consumes `GOOGLE_ACCESS_TOKEN_FILE` absolute path; JSON `{access_token: string, expiry_date: number}` where expiry_date is epoch milliseconds.
- With explicit file configuration, never fall back to ADC; missing/invalid/expired/oversized file fails with a credential-free error. With no file configuration, preserve existing ADC behavior for migration/local development.
- Read the current file for each request so atomic host replacement takes effect; no token refresh request from the app.

- [ ] Write failing tests using real temporary files and the installed Google library. Synthetic fixture token must not be a real credential. The test below expresses the expiry boundary; add valid header, atomic replacement, malformed/missing/oversized file, and no-secret error checks.

```js
await writeFile(tokenPath, JSON.stringify({access_token: 'fixture-token', expiry_date: Date.now() - 1}));
const auth = createGoogleRuntimeAuth({GOOGLE_ACCESS_TOKEN_FILE: tokenPath});
await assert.rejects(auth.getRequestHeaders(), error =>
  error.message === 'GOOGLE_RUNTIME_TOKEN_UNAVAILABLE' && !String(error.stack).includes('fixture-token'));
```

- [ ] Run RED: `node --test lib/server/google-runtime-auth.test.mjs` and record the missing behavior failure.
- [ ] Implement bounded file read (16KiB maximum), nonempty bearer token without whitespace/control characters, safe integer expiry with 30 seconds of remaining lifetime. Reject symlink/non-regular file and group/world-writable files. Allow group-readable files because deployment uses a shared runtime group.
- [ ] Use the installed OAuth2Client/AuthClient contract rather than an ad-hoc incomplete fake. Sanitize transport errors that might contain authorization headers, request bodies, or response contents. Do not automatically retry ambiguous Chirp submit requests.
- [ ] Wire GoogleEmbeddingProvider with `googleAuthOptions.authClient` and ChirpTranscription's default auth, preserving injected test clients. Keep local ADC path unchanged.
- [ ] Extend installed SDK wire-format test to consume the real file auth client with a synthetic transport; exercise Chirp request with the same client. Tests must check refresh on file replacement and no app-side WIF exchange.
- [ ] Run GREEN and existing tests: `node --experimental-strip-types --test lib/server/google-runtime-auth.test.mjs lib/server/chirp-transcription.test.mjs lib/ai-ops/search/provider.test.mjs`.
- [ ] Self-review and commit only the six task paths. Report RED/GREEN evidence; no push.

## Task 2: 제한된 Object Storage Unix socket 경계

**Files:**
- Create: `lib/server/object-storage-broker-client.mjs`, `lib/server/object-storage-broker.test.mjs`
- Create: `ops/oci-runtime/object-broker.mjs`, `ops/oci-runtime/object-broker.test.mjs`
- Modify: `lib/server/object-storage.mjs`

**Interfaces:**
- `createObjectBrokerServer({config, store, maxConcurrent = 4, timeoutMs = 60000})` returns a Node HTTP server; caller binds a Unix socket, never a TCP port.
- store matches OCI `getObject`, `putObject`, `deleteObject` SDK calls; tests replace only the external OCI boundary.
- app mode `OCI_STORAGE_AUTH=broker`, socket env `OCI_STORAGE_BROKER_SOCKET` absolute path.
- `createObjectBrokerClient(socketPath)` returns the same get/put/delete interface used by object-storage.mjs, including numeric `statusCode` errors for 404/412.
- Protocol: GET/PUT/DELETE `/v1/objects/<base64url(JSON)>`. JSON contains exactly `{scope, project, slug, sha256, bytes}`. PUT body is raw bytes with Content-Length and Content-Type. Config is fixed on host and is never provided by the caller. No query parameters accepted.
- Map OCI get response to raw byte body, preserving content length; client returns `{value: Readable, contentLength}`. PUT returns status 201 and empty body; 412 maps to existing-object semantics. DELETE succeeds with 204, tolerates object already absent through existing caller handling. Never forward upstream error bodies/headers.

- [ ] Write RED tests against a real Unix socket in `mkdtemp('/tmp/pm-broker-')`, close owned server and remove socket/temp files in finally/after hooks.

```js
const client = createObjectBrokerClient(socketPath);
await client.putObject({namespaceName:'ns', bucketName:'bucket', objectName:`materials/project/item/${hash}`,
  putObjectBody: bytes, contentLength:bytes.length, contentType:'application/pdf', ifNoneMatch:'*'});
const response = await client.getObject({namespaceName:'ns', bucketName:'bucket', objectName:`materials/project/item/${hash}`});
assert.equal(response.contentLength, bytes.length);
```

The client needs expected bytes for reference validation on GET/DELETE. Pass reference metadata from
object-storage.mjs as an explicit additional `brokerReference: {scope, project, slug, sha256, bytes}`
on each call; do not infer missing length or query OCI to discover arbitrary paths.

- [ ] Add tests for allowed materials/recordings, Korean/encoded slug handling, path traversal, `%` double encoding, unknown scope, extra fields, unknown method/route, missing length, oversized declaration/body, body/hash mismatch, truncated GET, upstream error redaction, slow/aborted request and concurrency exhaustion.
- [ ] Run RED: `node --test lib/server/object-storage-broker.test.mjs ops/oci-runtime/object-broker.test.mjs`.
- [ ] Implement independent host validation: scope allowlist, identifiers nonempty <=256 chars, reject slash/backslash/control chars, dot segments, encoded path metacharacters. Hash lowercase64hex; bytes integer 1..scope limit. Construct object key with encodeURIComponent. Validate PUT byte count and SHA before OCI call, retain ifNoneMatch `*`. Validate GET count/hash before marking completed response; don't leak corrupt content to successful callers.
- [ ] Bound request-header bytes, route length, connection/request timeout, body bytes, upstream wait, concurrency including GET/DELETE. Abort/discard upstream work on timeout where SDK permits; do not free concurrency capacity while still consuming an unbounded abandoned response.
- [ ] Implement client with fixed Unix socket destination, finite timeout, bounded response, no redirects/retries, generic sanitized errors and only the required status codes.
- [ ] Update object-storage.mjs's client selector for broker mode and add brokerReference at read/put/delete callsites; preserve existing reference checks/hash/cleanup. Existing direct mode remains only for staged cutover; final deployment override selects broker and no automatic fallback.
- [ ] Run GREEN: new tests plus existing object-storage/material-storage/Chirp tests.
- [ ] Self-review and commit exact task paths. No push or server action.

## Task 3: 호스트 실행·단기 토큰 발행·전환 패키지

**Files:**
- Create: `ops/oci-runtime/host-runtime.mjs`, `ops/oci-runtime/token-publisher.mjs`, `ops/oci-runtime/token-publisher.test.mjs`
- Create: `ops/oci-runtime/project-management-object-broker.service`, `ops/oci-runtime/project-management-google-token.service`, `ops/oci-runtime/project-management-google-token.timer`
- Create: `docker-compose.identity-boundary.yml`, `ops/oci-runtime/README.md`
- Modify: `docs/object-storage.md`, `docs/ai-search.md`, `docs/recordings.md`

**Interfaces:**
- Host Node runtime uses the existing locked OCI/Google dependencies from a root-owned deployment artifact. Server currently has no native Node; README must require verified Node24 runtime installation before units are started. No hidden package installation or curl-to-shell execution.
- Host config: non-secret `OCI_STORAGE_REGION/NAMESPACE/BUCKET`, `OCI_STORAGE_BROKER_SOCKET=/run/project-management-broker/storage.sock`.
- Host ADC stays `/run/project-management-wif/adc.json`; application token output `/run/project-management-google/access-token.json`.
- Broker directory and Google output directory are disjoint. App mounts only those two, never the WIF directory.
- `publishGoogleToken({auth, outputPath, now = Date.now})`: exchanges host auth, verifies token/expiry, publishes JSON atomically with mode0640 in a root-owned tmpfs directory. No credentials in stdout/errors. Keep previous valid output on failed refresh.

- [ ] RED test: real file publication/permissions, replacement without partial JSON, provider error preserving last token, expired/oversized/malformed provider token rejected without output, error redaction.

```js
await publishGoogleToken({auth: fakeHostAuth, outputPath});
assert.equal((await stat(outputPath)).mode & 0o777, 0o640);
const data = JSON.parse(await readFile(outputPath, 'utf8'));
assert.equal(data.access_token, 'fixture-token');
assert.ok(data.expiry_date > Date.now());
```

- [ ] Implement publisher with same-process host GoogleAuth, reading the existing WIF ADC. Refresh every 5 minutes; fail if lifetime <60 seconds. The app never sees host ADC or certificate files.
- [ ] Implement host-runtime entrypoint that builds OCI InstancePrincipal ObjectStorageClient and binds only the Unix socket. Handle SIGTERM/SIGINT and cleanup only its own socket. Refuse replacing unexpected existing files at socket path.
- [ ] Add systemd units using root-owned code/runtime paths, restrictive UMask/ReadWritePaths, NoNewPrivileges, ProtectSystem, PrivateTmp; fixed group for app-visible files/socket must be checked against existing host groups at installation. Explicitly document how app obtains only runtime group membership and socket/token file read rights.
- [ ] Add opt-in Compose override selecting broker and GOOGLE_ACCESS_TOKEN_FILE, clearing GOOGLE_APPLICATION_CREDENTIALS, replacing rather than merging old WIF mounts. Do not change production default or Actions before operator installs host runtime. Existing DB credentials remain unchanged in this A-only phase; do not claim Vault migration complete.
- [ ] README gives ordered install/cutover/rollback steps, exact stop conditions, metadata firewall persistence requirements, no TCP proxy, no broad IAM addition, key/token lifetime caveat, and live verification checklist. No destructive global Docker/network commands.
- [ ] Explain recording worker optional activation separately; do not start currently absent worker or grant new Google capabilities.
- [ ] Run GREEN, `pnpm typecheck`, `pnpm build`, `git diff --check`. Do not run shared DB integration tests. Validate Compose merging with installed parser if available, otherwise report that limit and leave deployment gated.
- [ ] Commit exact task paths without push. Request final independent review before merge/deployment handoff.

## Delivery gate

Main is preserved. This branch adds an opt-in migration path; until host setup, default-branch
integration, deployment, IMDS checks and expired-identity checks are complete, do not create new
VM Secret access grants or rotate live app credentials. Report local checks separately from
server rollout. The next implementation unit is Vault delivery and actual account rotation.
