# 계정 및 공유

## API 계약
응답 실패는 `{message: string}`. 모든 쓰기는 JSON 및 동일 Origin 필요. 화면은 기존 Dropdown/Button 스타일을 사용한다.

- `POST /api/login` `{username,password}` → 204. username이 빈 문자열이면 OWNER 등록 전 기존 공통 비밀번호로만 로그인한다.
- `POST /api/logout` → 204 (DB 세션도 폐기).
- `GET /api/access` → `{actor:{id,username,name,role:'OWNER'|'ADMIN'|'MEMBER',bootstrap:boolean}, users:[{id,username,name,role,active,memberships:[{projectSlug,role:'VIEWER'|'EDITOR'}]}], projects:[{slug,title,charts:[{slug,title}]}], shares:[{id,projectSlug,chartSlug,expiresAt}]}`. OWNER/ADMIN 전용. bootstrap actor는 OWNER이지만 id='bootstrap'. ADMIN 응답에서 OWNER와 개인 프로젝트 제외.
- `POST /api/access` `{action:'bootstrap',username,name,password}` → 204 및 새 소유자 세션 설정.
- `POST /api/access` `{action:'createUser',username,name,password,role:'ADMIN'|'MEMBER'}` → 204. 활성 계정을 즉시 생성한다. 비밀번호는 scrypt 해시로만 저장하며 응답·감사 로그에 포함하지 않는다. 요청한 관리자 세션은 유지한다. 중복 아이디는 409, 관리자 역할 발급은 OWNER만 가능하다.
- `POST /api/access` `{action:'updateUser',id,active:boolean,role:'ADMIN'|'MEMBER',memberships:[{projectSlug,role:'VIEWER'|'EDITOR'}]}` → 204. 자기 자신/OWNER 수정 불가. 권한 변경 즉시 기존 세션 폐기. ADMIN 계정 생성/역할 변경은 OWNER만 가능.
- `POST /api/access` `{action:'share',projectSlug,chartSlug,days:number}` → `{path:'/share/<token>'}`. days 1~90 기본 7. 회사 프로젝트 단일 문서만, TNS ERD 제외.
- `POST /api/access` `{action:'revokeShare',id}` → 204.
- `POST /api/invite` → 410. 이전 초대는 더 이상 계정을 만들거나 로그인 세션을 발급하지 않는다. `/invite/<token>`은 계정 발급 방식 전환 안내만 표시한다.
- `POST /api/account/password` `{currentPassword,password}` → 204 및 다른 세션 모두 폐기/현재 세션 교체.

## UI
`/settings`는 계정/권한/공유 관리. `/account`는 모든 계정의 자신의 비밀번호 변경. 로그인 성공 후 `/flows` 이동. bootstrap 로그인은 `/settings` 이동 가능하나 `/flows`에서도 등록 링크를 안내한다. 공유 URL은 생성 직후만 표시하며 회수/재발급할 수 있다. 비밀번호 최소 12자, 최대 128자; username은 영문 소문자/숫자/점/밑줄/대시 3~64자.

설정 → 계정 및 프로젝트 권한에서 각 계정의 **권한 편집** 버튼으로 역할, 활성 상태, 프로젝트별 접근 불가/열람/편집 권한을 나중에도 수정할 수 있다. 목록에는 저장된 권한 요약이 표시된다. 취소하면 변경 내용을 저장하지 않으며, 저장하면 기존 세션을 종료해 다음 로그인부터 새 권한을 적용한다. 관리자는 회사 프로젝트 전체 권한이므로 프로젝트별 선택은 멤버에게만 표시한다.

## 권한과 보관
OWNER는 개인 프로젝트·AI·업무 기록·전역 UI 설정을 포함한 소유자 데이터에 접근한다. ADMIN은 회사 프로젝트의 관리 권한을 가지며 MEMBER는 부여받은 프로젝트에만 접근한다. VIEWER는 조회, EDITOR는 조회·작성·수정, 삭제는 OWNER/ADMIN만 가능하다. 새 경로는 일반 사용자에게 기본 거부한다. 프로젝트별 권한 변경/계정 비활성화는 기존 세션을 폐기한다.

공유 페이지는 문서의 현재 내용을 조회한다. 한 번 내려받은 내용까지 회수하지는 않는다. 공유 기본 만료는 7일, 최대 90일이며 원본 자료나 AI 데이터의 영구 보관 정책과 무관하다. 개인 프로젝트와 전체 스냅샷을 필요로 하는 TNS ERD는 공유하지 않는다. 공유 토큰은 생성할 때만 화면에 제공하고 DB에는 SHA-256만 저장한다. HTML은 기존 sandbox/CSP 렌더러를 유지한다.

## 운영 전환
1. 읽기 전용 검사: `pnpm db:shared -- node scripts/access-inspect.mjs`. 테이블 유무, 기존 문서 수와 migration 이력만 출력한다.
2. 명시적 운영 반영 승인 후 기존 백업 절차로 DB를 백업·검증한다. 새 migration `20260918090000_account_access`는 7개 계정 관련 테이블/제약만 추가하며 기존 자료를 변환하거나 삭제하지 않는다.
3. `migrate deploy`와 새 앱 배포를 수행한다. 배포가 Prisma migration을 자동 적용한다면 중복 수동 적용하지 않는다. 기존 공통 비밀번호를 신뢰하는 구버전 앱을 먼저 교체하고, 새 앱만 동작하는 것을 확인한 후 소유자 계정을 등록한다. 구버전 앱으로 되돌아가면 새 권한이 집행되지 않으므로 계정 활성화 후 구버전 롤백은 금지한다.
4. 계정 ID를 비우고 기존 비밀번호로 로그인 → 설정 → 소유자 ID/이름/새 비밀번호 등록. 이 시점부터 기존 세션은 거부된다. 이후 소유자가 아이디·이름·초기 비밀번호·역할을 입력해 계정을 발급하고 프로젝트별 권한을 부여한다. 로그인 정보는 관리자가 직접 전달하며, 사용자는 `/account`에서 본인 비밀번호를 변경할 수 있다.
5. DB 구조만 추가하고 코드가 구버전인 동안에는 기존 인증이 유지된다. 반대로 새 코드가 migration 전 DB에 연결되면 API는 503으로 접근을 차단하고, 페이지 요청은 로그인 화면으로 이동해 서비스 이용 불가를 안내한다. 로그인 페이지 자체는 DB 없이 표시한다. 로컬 기본 실행도 운영 DB를 공유하므로 migration 승인 전 계정 로그인/등록은 사용할 수 없다.

소유자 비밀번호 분실 시 무인 재설정/공통 비밀번호 재활성화는 지원하지 않는다. 개인 SSH를 통한 승인된 관리 작업으로 복구하고 모든 세션을 폐기해야 한다.

## 검증
테스트 DB는 `localhost:5432/project_management_test`로 제한한다. `lib/test-database.ts` 검증 없이 테스트 migration/정리를 실행하지 않는다.

```sh
NODE_OPTIONS=--experimental-strip-types pnpm test
pnpm typecheck
pnpm build
node --env-file=.env --experimental-strip-types scripts/check-access-http.mjs
```

HTTP 검증은 빌드된 앱을 임시 로컬 포트에서 띄우며 종료 시 자신이 시작한 서버와 fixture를 정리한다. 운영 DB나 기존 개발 서버에는 연결하지 않는다. 브라우저 검증은 별도 요청 시에만 수행한다.

## 관리자 직접 발급 전환
계정 발급 폼의 비밀번호는 생성 성공 시 지운다. 기존 계정·비밀번호·프로젝트 권한은 변경하지 않는다. 신규 MEMBER 계정은 기본적으로 프로젝트 접근 권한이 없으므로 아래 계정 목록에서 VIEWER/EDITOR를 지정한다. 비밀번호 변경을 강제하지는 않는다.

기존 `access_invite` 테이블과 행은 이력 보존을 위해 그대로 두지만 런타임에서 조회/발급/소비하지 않는다. 추가 migration이나 운영 데이터 삭제는 필요 없다. 기존 초대 발급/회수 action은 지원하지 않는다. 공유 링크 기능은 그대로 유지한다.
