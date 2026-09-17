# 개인 프로젝트 GitHub 연결

`/personal`의 개인 프로젝트에만 GitHub 주소 입력·권한 확인·연결 해제 기능을 제공한다.
풀링 프로젝트에는 UI를 추가하지 않으며 API에서도 `isPersonalProject`로 차단한다.
현재 등록된 세 프로젝트에 연결하며, 새로운 프로젝트 생성이나 GitHub 이슈 동기화는 이 기능에 포함하지 않는다.

## 최초 GitHub App 설정

여기서 GitHub App은 모바일 앱이 아니라 이 사이트가 사용하는 GitHub 연동 프로그램이다.

1. [GitHub App 등록](https://github.com/settings/apps/new)에서 프로그램을 만든다.
2. Homepage URL은 `https://project.dev-uk.shop`으로 설정한다.
3. 운영 Callback URL은 `https://project.dev-uk.shop/api/github/callback`을 등록한다.
   이 기능의 배포가 완료되어야 운영 URL에서 인증을 마칠 수 있다.
4. 로컬 검증이 필요하면 `http://localhost:30001/api/github/callback`도 등록한다.
   `127.0.0.1`로 접속한다면 해당 주소도 별도로 등록한다. 와일드카드는 사용하지 않는다.
   인증을 시작한 브라우저의 앱 로그인·PKCE 쿠키가 필요하므로 로컬에서 시작해 운영으로 돌아오는 방식은 사용하지 않는다.
5. **Expire user authorization tokens**를 활성화한다. 권한은 **Repository permissions → Metadata: Read-only**로 시작한다.
   코드·이슈 쓰기 권한과 Private key는 필요 없다. Webhook 활성화는 해제한다.
6. 본인 및 참여 중인 저장소에 앱을 설치한다. 다른 소유자/조직의 저장소는 소유자나 조직 관리자에게 설치 권한이 필요할 수 있다.
7. Client ID, 앱 URL의 slug를 서버 설정에 등록한다. Client Secret은 OCI Secret에 직접 보관하고 채팅·Git·로컬 파일에 복사하지 않는다.

## OCI Secret 및 서버 설정

기존 OCI 인프라를 유지한다. 런타임은 instance principal, 로컬은 기존 개인 OCI 설정을 사용한다.
이 기능을 추가하는 것만으로 클라우드 리소스·IAM·운영 설정이 생성되거나 배포되지는 않는다.

서로 다른 Secret 두 개를 준비한다.

| Secret | 초기 내용 | 런타임 권한 |
| --- | --- | --- |
| GitHub client secret | GitHub App Client Secret 원문 | 해당 Secret bundle 읽기 |
| GitHub 사용자 토큰 | 빈 JSON 객체 `{}` | 해당 Secret bundle 읽기, Secret 메타데이터 읽기 및 내용 갱신 |

다른 Secret 전체에 권한을 부여하지 않는다. 개인별 OCI 인증을 사용하고 별도의 클라우드 액세스 키를 발급하지 않는다.
Client Secret 소유자는 앱 운영자이며 목적은 OAuth 코드 교환이다. 교체 시 Secret의 CURRENT 버전을 갱신하고, 유출 의심 시 GitHub에서도 폐기한다.
토큰 Secret은 인증·갱신 시 버전이 추가된다. OCI Secret 버전 한도를 모니터링하고, 사용이 끝난 이전 버전은 운영 절차로 정리한다.

환경 변수에는 비밀값 대신 아래 메타데이터만 넣는다.

| 변수 | 내용 |
| --- | --- |
| `GITHUB_APP_CLIENT_ID` | GitHub App의 Client ID (App ID가 아님) |
| `GITHUB_APP_SLUG` | `github.com/apps/<slug>`의 slug |
| `GITHUB_APP_BASE_URL` | 운영 `https://project.dev-uk.shop`, 로컬은 실제 접속 origin |
| `OCI_GITHUB_REGION` | 두 Secret이 위치한 OCI 리전 |
| `OCI_GITHUB_CLIENT_SECRET_ID` | Client Secret의 OCID |
| `OCI_GITHUB_TOKEN_SECRET_ID` | 사용자 토큰 Secret의 OCID |
| `OCI_GITHUB_AUTH` | 운영 `instance_principal`, 로컬 `config_file` |

로컬·배포 앱은 같은 DB와 연결 계정을 공유한다. 동일한 토큰 Secret을 지정하고, 환경별로 base URL만 맞춘다.
이미 사용하는 `.env`의 DB/로그인 설정은 그대로 유지하며 여기에 OAuth 비밀값을 추가하지 않는다.

## 인증과 권한 검증

- 개발에서도 유효한 앱 로그인 세션이 필수다. 쓰기 요청은 Origin도 검사한다.
- OAuth state는 앱 세션에 묶인 10분 유효 요청이며 DB의 조건부 삭제로 한 번만 사용한다. PKCE S256을 사용하고 verifier는 HttpOnly 쿠키로 전달한다.
- GitHub access/refresh token은 OCI Secret에만 저장한다. 토큰을 JSON 응답, 로그, 브라우저 스토리지나 DB에 저장하지 않는다.
- PostgreSQL advisory lock으로 여러 서버의 토큰 갱신·계정 교체를 직렬화한다. 만료 토큰은 refresh token으로 갱신하고 실패하면 재연결을 안내한다.
- `GET /repos/{owner}/{repo}`로 메타데이터를 읽은 후 `GET /user/repos?affiliation=owner,collaborator,organization_member` 전체 페이지와 repository ID를 대조한다. 공개 조회 성공만으로는 저장하지 않는다.
- 사용자 입력 주소로 직접 네트워크 요청을 보내지 않는다. GitHub HTTPS 저장소 주소만 파싱하고 서버가 `api.github.com` 경로를 구성한다. 리다이렉트는 따라가지 않는다.
- 저장·재확인 시 권한을 검사한다. 화면의 최근 확인 시각은 스냅샷이며, 이후 권한이 계속 유지된다는 뜻은 아니다. `확인 후 저장`으로 다시 검사할 수 있다.
- 인증 계정을 바꾸면 기존 링크는 보존하고 이전 계정으로 확인된 링크에 `계정 확인 필요`를 표시한다.
- 연결 해제는 프로젝트 링크만 제거한다. GitHub 저장소·앱 설치·할 일·자료·기록·회의록은 삭제하지 않는다.

## 저장 및 검증

`app_setting`의 `github:repository:<personal-project-slug>`에 GitHub repository ID·정규 URL·공개 여부·기본 브랜치·확인 계정·확인 시각을 저장한다.
`github:account`에는 계정 ID/login만, `github:oauth-pending`에는 일회성 인증 요청의 해시·만료시각만 저장한다. GET은 쓰지 않으며 스키마 마이그레이션은 없다.

```sh
node --experimental-strip-types --env-file-if-exists=.env --test --test-concurrency=1 lib/github.test.mjs lib/server/github-http.test.mjs lib/server/github-store.test.mjs
pnpm typecheck
pnpm build
```

DB 테스트는 기존 가드가 적용된 `localhost:5432/project_management_test`만 사용한다.
실제 GitHub 승인·OCI Secret 접근·권한 조회·저장은 최초 설정 이후 별도로 확인해야 한다. 브라우저 검증은 사용자가 요청한 경우만 수행한다.

공식 근거: [GitHub 사용자 인증](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
[Callback URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url),
[사용자 레포지토리 목록](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user).
