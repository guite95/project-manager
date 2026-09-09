# OCI 배포

PostgreSQL 은 인스턴스에 이미 떠 있는 컨테이너를 쓴다. 새로 띄우지 않는다.

## 처음 한 번

1. PostgreSQL 컨테이너가 붙은 네트워크 이름을 확인한다.

   ```bash
   docker network ls
   docker inspect <postgres 컨테이너> --format '{{json .NetworkSettings.Networks}}'
   ```

2. 데이터베이스를 만든다.

   ```bash
   docker exec -it <postgres 컨테이너> createdb -U postgres project_management
   ```

3. 비밀번호 해시를 만든다. 로컬에서 돌린다.

   ```bash
   node scripts/hash-password.mjs
   ```

4. 세션 서명 키를 만든다.

   ```bash
   openssl rand -hex 32
   ```

5. 인스턴스의 저장소 루트에 `.env` 를 만든다.

   ```
   DATABASE_URL=postgresql://postgres:<비밀번호>@<postgres 컨테이너 이름>:5432/project_management
   APP_PASSWORD_HASH=<3번 결과>
   SESSION_SECRET=<4번 결과>
   DB_NETWORK_NAME=<1번에서 확인한 이름>
   ```

   `.env` 는 커밋하지 않는다. Compose 가 이 파일을 읽어 컨테이너에 넘긴다.

## 띄우기

```bash
docker compose up -d --build
```

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
docker exec <postgres 컨테이너> pg_dump -U postgres project_management \
  | gzip > backup-$(date +%F).sql.gz
```

크론에 걸어 두고 결과를 OCI Object Storage 로 올리면 된다.

## 비밀번호 바꾸기

1. `node scripts/hash-password.mjs` 로 새 해시를 만든다.
2. 인스턴스의 `.env` 에서 `APP_PASSWORD_HASH` 를 바꾼다.
3. `docker compose up -d` 로 다시 띄운다.

`SESSION_SECRET` 을 바꾸면 이미 로그인한 세션이 전부 끊긴다.
