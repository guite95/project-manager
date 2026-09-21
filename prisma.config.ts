/**
 * Prisma 7 부터 접속 URL 은 스키마가 아니라 여기에 둔다.
 * 런타임 클라이언트는 `lib/db.ts` 에서 드라이버 어댑터로 따로 연결한다.
 * 이 파일은 migrate·introspect 같은 CLI 명령이 쓴다.
 */
import { defineConfig } from "prisma/config";
import { getMigrationDatabaseUrl } from './lib/server/runtime-secrets.mjs';

// Prisma 7 은 .env 를 알아서 읽지 않는다. Node 내장 기능으로 읽는다.
// 컨테이너처럼 파일 없이 환경변수만 주는 곳도 있으므로 없으면 그냥 넘어간다.
try {
  process.loadEnvFile(".env");
} catch {
  // 파일이 없으면 이미 환경에 들어있는 값을 쓴다.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: getMigrationDatabaseUrl(),
  },
});
