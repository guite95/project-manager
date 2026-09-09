# OCI 배포

PostgreSQL 은 인스턴스에 이미 떠 있는 컨테이너를 쓴다. 새로 띄우지 않는다.

## 서버 준비 상태 (2026-09-09)

- 서비스 주소: `https://project.dev-uk.shop`
- 배포 디렉터리: SSH 접속 계정의 `~/project-management`, 해당 계정 소유, 권한 `700`
- 환경변수: 위 디렉터리의 `.env`, 권한 `600`. DB 비밀번호·로그인 해시·세션 키 생성 완료
- DB: 기존 `postgresql` 컨테이너에 `project_management` 생성
- DB 계정: `project_management_app`. 해당 DB 소유자이며 superuser/DB 생성/역할 생성 권한 없음
- 네트워크: 기존 `shared-infra`. 앱은 `127.0.0.1:30001`에만 바인딩
- Nginx: `/etc/nginx/conf.d/project-management.conf` 설치, 문법 검사 및 reload 완료
- 접속 경로: 브라우저 → Cloudflare HTTPS → 서버 Nginx HTTP → 앱 로컬 포트

Cloudflare 공개 인증서와 프록시 경로를 확인했다. 원본 서버의 이 가상 호스트는
HTTP를 사용하므로 Cloudflare의 SSL 모드를 Full (strict)로 바꾸려면 이 도메인용
원본 인증서와 Nginx 443 설정을 먼저 추가해야 한다.

프록시만 확인하는 `/.well-known/project-management-health`는 `204`로 응답한다.
아직 앱 컨테이너는 배포하지 않았으므로 메인 주소는 `503` 배포 대기 응답이다.
앱 기동과 Prisma 마이그레이션은 첫 GitHub Actions 배포에서 실행된다.

초기 앱 로그인 비밀번호는 서버의 `.initial-login-password` 파일에 권한 `600`으로
보관했다. 개인 터미널에 `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_KEY_PATH`
환경변수를 설정한 뒤 아래 명령으로 확인하고 비밀번호 관리 도구에 보관한다.
`SSH_KEY_PATH`는 개인키의 로컬 파일 경로이며 GitHub Secret은 아니다.

```bash
ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" \
  'cat ~/project-management/.initial-login-password'
```

이 비밀번호와 DB 접속정보, 세션 키는 GitHub Secret에 등록할 필요가 없다.
GitHub에는 아래의 SSH 접속용 Secret 4개를 등록한다.

## GitHub Actions 자동 배포

`.github/workflows/deploy.yml` 은 `master` push 또는 Actions의 **Run workflow**
(`master` 선택)로 실행한다. 기본 브랜치를 바꾸면 워크플로우의 `branches`와
job의 `if`도 함께 바꾼다.

- 대상: GitHub Secrets의 `SSH_HOST`, `SSH_PORT`, `SSH_USER`로 지정
- 배포 경로: SSH 접속 계정의 `~/project-management`
- 빌드: GitHub의 `ubuntu-24.04-arm` 러너에서 ARM64 Docker 이미지 생성
- 전송: SSH/SCP로 이미지와 `docker-compose.yml` 전송. 별도 이미지 레지스트리는 사용하지 않는다.
- 실행: 이미지를 로드하고 앱만 교체한다. 시작 시 Prisma 마이그레이션을 적용한다.
- 확인: 로컬 포트와 공개 HTTPS 주소에서 `/today`가 `/login`으로 `307`, `/login`이 `200` 응답해야 성공한다.

GitHub 저장소의 **Settings → Secrets and variables → Actions**에 다음
Repository secret을 등록한다.

| 이름 | 값 |
| --- | --- |
| `SSH_HOST` | 배포 서버의 IP 주소 또는 호스트 이름 |
| `SSH_PORT` | 배포 서버의 SSH 포트 번호 |
| `SSH_USER` | 배포 서버의 SSH 접속 계정 |
| `SSH_PRIVATE_KEY` | SSH 개인키 내용 전체. 파일 경로가 아니다. |

개인키와 서버 `.env`는 저장소에 넣지 않는다. SSH 서버 공개키는 기존 로컬
known_hosts로 검증한 `.github/deploy_known_hosts`에 고정되어 있다.
워크플로우는 접속 대상과 계정을 Secret에서 읽으며, 서버 공개키 검증에는
`HostKeyAlias deploy-target`을 사용해 IP·포트와 공개키를 분리한다.
서버 키가 변경되면 별도 신뢰 경로로 확인한 뒤 이 파일을 갱신한다.
배포 경로는 SSH 접속 계정의 `~/project-management`다. `SSH_USER`를 바꿀 경우
새 계정의 홈 디렉터리에 배포 환경과 Docker 실행 권한도 준비해야 한다.

현재 서버의 디렉터리·`.env`·DB는 준비되어 있다. 아래 초기 설정은 새 서버를
구성할 때 참고하며, 현재 서버의 비밀번호를 덮어쓰지 않는다.
GitHub 러너에서 지정한 서버의 SSH 포트로 접속할 수 있어야 하며,
SSH 접속 계정에 Docker 실행 권한이 필요하다.

```bash
ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" "$SSH_USER@$SSH_HOST"
install -d -m 700 ~/project-management
cd ~/project-management
# 아래 환경변수 예시대로 .env를 작성한 뒤:
chmod 600 .env
```

2026-09-09 서버 확인 기준 PostgreSQL 컨테이너 이름은 `postgresql`,
네트워크는 `shared-infra`다. 이미지 빌드에는 운영 DB 접속정보를 전달하지 않는다.
빌드 단계의 Prisma 생성/검증에 사용하는 URL은 접속하지 않는 임시 값이다.

동시 배포는 직렬화한다. 빌드 실패 시 기존 앱을 교체하지 않으며, 실행 후
응답 검증 실패 시 워크플로우가 실패한다. 자동 롤백은 하지 않는다.
성공한 이미지에는 `project-management:local` 태그도 붙여 수동 Compose 명령에서 사용한다.
이전 커밋의 이미지는 남겨두며, 다른 서비스에 영향을 줄 수 있는 전역 이미지 정리는 하지 않는다.

## 처음 한 번

1. PostgreSQL 컨테이너가 붙은 네트워크 이름을 확인한다.

   ```bash
   docker network ls
   docker inspect <postgres 컨테이너> --format '{{json .NetworkSettings.Networks}}'
   ```

2. 전용 로그인 역할 `project_management_app`을 안전한 임의 비밀번호로 만든 뒤,
   해당 역할을 소유자로 데이터베이스를 만든다. 현재 서버의 관리자 역할은
   `flightapp`이다. 앱에는 관리자 계정의 접속정보를 사용하지 않는다.

   ```bash
   docker exec -it postgresql createdb -U flightapp -O project_management_app project_management
   ```

3. 비밀번호 해시를 만든다. 로컬에서 돌린다.

   ```bash
   node scripts/hash-password.mjs
   ```

4. 세션 서명 키를 만든다.

   ```bash
   openssl rand -hex 32
   ```

5. SSH 접속 계정의 `~/project-management/.env` 를 만든다.

   ```
   DATABASE_URL='postgresql://project_management_app:<URL 인코딩한 비밀번호>@postgresql:5432/project_management'
   APP_PASSWORD_HASH='<3번 결과>'
   SESSION_SECRET='<4번 결과>'
   DB_NETWORK_NAME=shared-infra
   ```

   `.env` 는 커밋하지 않는다. Compose 가 이 파일을 읽어 컨테이너에 넘긴다.
   해시에 포함된 `$`가 Compose 변수로 해석되지 않도록 작은따옴표를 유지한다.

## 띄우기

소스가 있는 환경에서 수동 빌드할 때:

```bash
docker compose up -d --build
```

Actions가 이미지를 배포한 서버에서 `.env` 수정 후 다시 적용할 때:

```bash
cd ~/project-management
docker compose up -d --no-build --pull never app
```

Actions는 소스와 Dockerfile을 서버로 복사하지 않으므로 서버에서 `--build`를 쓰지 않는다.

마이그레이션은 컨테이너가 시작할 때 자동으로 적용된다.

## 확인

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:30001/today
```

`307` 과 `/login` 이 나와야 한다. 프로덕션 빌드는 항상 비밀번호를 묻는다.
개발 환경에서만 묻지 않는다.

## 로그와 재시작

```bash
docker compose logs -f app
docker compose restart app
```

## 백업

```bash
docker exec postgresql pg_dump -U flightapp project_management \
  | gzip > backup-$(date +%F).sql.gz
```

크론에 걸어 두고 결과를 OCI Object Storage 로 올리면 된다.
이번 인프라 준비에서는 자동 백업 스케줄은 추가하지 않았다.

## Nginx 설정 변경

원본은 `nginx/project-management.conf`다. 앱 배포 워크플로우는 Nginx를 수정하지
않으므로 프록시 변경이 필요할 때 이 파일을 서버로 복사해 설치한다.
현재 서버의 `/etc/nginx/conf.d/00-websocket-map.conf`에 있는
`$connection_upgrade` 맵을 사용한다.

```bash
sudo install -m 644 ~/project-management/nginx/project-management.conf \
  /etc/nginx/conf.d/project-management.conf
sudo nginx -t && sudo systemctl reload nginx
```

## 비밀번호 바꾸기

1. `node scripts/hash-password.mjs` 로 새 해시를 만든다.
2. 인스턴스의 `.env` 에서 `APP_PASSWORD_HASH` 를 바꾼다.
3. `docker compose up -d` 로 다시 띄운다.

`SESSION_SECRET` 을 바꾸면 이미 로그인한 세션이 전부 끊긴다.
