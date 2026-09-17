# 개인 프로젝트 GitHub 연결

`/personal`에서 본인 계정의 **Fine-grained personal access token(PAT)**으로 개인·조직 레포지토리를 연결한다.
GitHub App 설치, Client ID/Secret, Callback URL은 사용하지 않는다.
기능은 개인 프로젝트에만 표시하며 풀링·미등록 프로젝트는 API에서도 거부한다.
기존 세 프로젝트의 자료·기록·회의록·할 일은 유지한다. 프로젝트 생성이나 GitHub 이슈 동기화는 포함하지 않는다.

## 사용자 연결 순서

1. [Fine-grained PAT 발급](https://github.com/settings/personal-access-tokens/new)에서 **Resource owner**를 본인 계정 또는 소속 조직으로 선택한다.
2. 필요한 레포지토리만 선택하고 Metadata 읽기 권한, 만료일을 지정한다. 이 기능에는 코드·이슈 쓰기 권한이 필요 없다.
3. 조직이 토큰 승인을 요구하면 승인 이후에 해당 비공개 레포지토리에 접근할 수 있다. 조직이 개인 토큰 사용을 막았다면 본인 계정으로도 우회할 수 없다.
4. 개인 프로젝트 화면에서 토큰 이름, 앱 사용 종료일, 토큰을 입력한다. 값은 채팅이나 `.env`로 전달하지 않는다.
5. 프로젝트의 사용할 토큰을 선택하고 레포지토리 주소를 입력한 뒤 **확인 후 연결**을 누른다.

Fine-grained PAT 하나는 한 사용자 또는 조직 소유 범위에 묶인다. 개인 계정·여러 조직의 레포지토리를 연결할 때는 범위별 토큰을 등록하고 프로젝트마다 선택한다. 최대 10개까지 등록할 수 있다.
이 방식은 조직 멤버 기준이다. 외부 협업자(Outside collaborator)에 대한 Fine-grained PAT 제한이 있으므로 같은 방식으로 된다고 안내하지 않는다. Classic PAT나 GitHub App 토큰은 받지 않는다.

앱 사용 종료일은 한국 시간 기준 오늘부터 90일 이내로 설정한다. 이는 **앱 자체의 사용 종료일**이며 GitHub 토큰 만료일을 조회하거나 변경하지 않는다.
GitHub에서 토큰이 먼저 만료·취소되거나 조직 정책이 바뀌면 GitHub API가 거부하며 새 토큰 등록 또는 조직 승인/SSO 확인을 안내한다.
토큰 자동 재발급·자동 갱신은 하지 않는다. 만료 전 새 토큰을 등록하고 프로젝트를 새 토큰으로 연결한 뒤 이전 토큰을 삭제한다.

## OCI 보안 저장소 최초 설정

기존 OCI 인프라와 개인 인증 설정을 사용한다. 토큰 원문은 OCI Secret 서비스에만 저장하며 PostgreSQL·브라우저 스토리지·로그에는 남기지 않는다.
서버에는 GitHub 개인 토큰 전용 Secret 하나가 필요하다. 초기 내용은 빈 JSON 객체 `{}`이다.
기존 GitHub App 형식의 내용이 있는 Secret은 자동으로 덮어쓰지 않는다. 별도 빈 Secret을 지정하거나 명시적인 운영 전환 절차를 거친다.

런타임 instance principal에 해당 Secret bundle 읽기, Secret 메타데이터 읽기 및 내용 갱신 권한만 부여한다. 다른 Secret 전체에 권한을 부여하지 않는다.
로컬은 기존 개인 OCI 인증 설정을 사용하며, 코드 추가만으로 클라우드 리소스·IAM·운영 설정이 만들어지거나 배포되지 않는다.

| 변수 | 내용 |
| --- | --- |
| `GITHUB_ALLOWED_ORIGIN` | 운영 `https://project.dev-uk.shop`, 로컬은 실제 브라우저 접속 origin. CSRF 검사에 사용 |
| `OCI_GITHUB_REGION` | 토큰 Secret이 위치한 OCI 리전 |
| `OCI_GITHUB_TOKEN_SECRET_ID` | 토큰 Secret의 OCID |
| `OCI_GITHUB_AUTH` | 운영 `instance_principal`, 로컬 `config_file` |

토큰 등록·삭제는 Secret의 CURRENT 버전을 갱신한다. PostgreSQL advisory lock과 OCI ETag로 동시 갱신 충돌을 방지한다.
앱에서 토큰을 삭제해도 GitHub 토큰 자체는 폐기되지 않고 Secret의 이전 버전에 남을 수 있다. 사용이 끝난 토큰은 GitHub에서도 폐기하고, 이전 Secret 버전은 운영 절차에 따라 정리한다. Secret 버전 한도를 모니터링한다.
앱 자체의 토큰 소유자는 입력한 토큰의 GitHub 계정이며, 목적은 개인 프로젝트의 소유·참여 확인이다. UI에서 계정과 사용 종료일을 확인할 수 있다.

## 서버 검증과 저장

- 개발 환경에서도 유효한 앱 로그인 세션이 필요하다. 쓰기에는 동일 출처 검사를 추가하고 토큰 입력 JSON은 4 KiB까지만 받는다.
- 입력한 토큰으로 `/user`를 호출해 실제 계정을 확인한 뒤 보관한다. 사용자 계정 확인은 조직 레포 접근 확인과 다르므로 프로젝트 연결 시 별도로 검사한다.
- 프로젝트 연결 시 토큰이 등록되어 있고 앱 사용 종료일이 지나지 않았는지 확인한다.
- `/repos/{owner}/{repo}` 조회 후 `/user/repos?affiliation=owner,collaborator,organization_member`를 페이지별로 읽어 repository ID를 대조한다. 공개 조회 성공만으로는 참여자로 인정하지 않는다.
- 사용자 주소로 직접 요청하지 않는다. `github.com`의 HTTPS 레포 URL만 파싱하여 고정된 `api.github.com` 경로로 요청하며 리다이렉트는 따라가지 않는다.
- 저장 직전에 토큰 삭제·교체·만료 여부를 다시 확인한다. 실패하면 기존 프로젝트 연결은 보존한다.
- OCI Secret이 토큰 및 토큰 메타데이터의 원본이다. 상태 API는 토큰 ID·이름·계정·앱 사용 종료일만 반환한다.
- `app_setting`의 `github:repository:<personal-project-slug>`에는 credential ID, repository ID, URL, 공개 여부, 기본 브랜치, 확인 계정과 확인 시각만 저장한다. 스키마 마이그레이션은 없다.
- 예전 GitHub App 링크는 주소를 보존하고 `토큰 선택·재확인 필요`로 표시한다. 기존 `github:account`, `github:oauth-pending` 값은 더 이상 읽지 않으며 자동 삭제하지 않는다.
- 화면의 최근 확인 시각은 스냅샷이다. 현재 권한을 다시 확인하려면 **확인 후 저장**을 사용한다.
- 토큰 삭제·프로젝트 연결 해제는 자료나 할 일을 삭제하지 않는다. 다른 프로젝트의 링크는 유지한다.

## 검증

```sh
node --experimental-strip-types --env-file-if-exists=.env --test --test-concurrency=1 lib/github.test.mjs lib/server/github-http.test.mjs lib/server/github-credentials.test.mjs
pnpm typecheck
pnpm build
```

DB 테스트는 기존 가드가 적용된 `localhost:5432/project_management_test`만 사용한다.
실제 OCI Secret 접근과 실제 GitHub 조직 레포 검증은 저장소 설정 및 사용자 토큰 등록 후 별도로 확인한다. 브라우저 검증은 사용자가 요청한 경우만 수행한다.

공식 근거: [개인 토큰의 권한과 제한](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens),
[사용자 레포지토리 목록](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user).
