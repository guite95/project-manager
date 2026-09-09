/**
 * 통합 테스트용 헬퍼. TEST_DATABASE_URL 이 가리키는 별도 데이터베이스를 쓰고,
 * 각 테스트 앞에서 테이블을 비운다.
 *
 * 이 헬퍼를 쓰는 테스트 파일은 **반드시 순차로 돌아야 한다**. 여러 파일이 같은
 * 데이터베이스를 동시에 비우면 서로의 데이터를 지운다. `package.json` 의 test
 * 스크립트가 `--test-concurrency=1` 을 붙이는 이유다.
 *
 * Prisma 클라이언트는 import 시점에 DATABASE_URL 을 읽으므로 그 전에 덮어쓴다.
 */
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL 이 없습니다. .env 를 확인하세요.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { prisma } = await import("../db.ts");

export { prisma };

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "completion", "issue", "project_note", "custom_project", "app_setting" RESTART IDENTITY CASCADE',
  );
}
