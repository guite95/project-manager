/**
 * 통합 테스트용 데이터베이스만 비운다.
 *
 *   node --env-file=.env scripts/reset-test-db.mjs
 *
 * 개발 DB(DATABASE_URL)에는 실제 할 일과 명심할 점이 들어 있다. 검증하다가
 * 그쪽을 비우면 되살릴 방법이 없다 — 백업도 WAL 아카이브도 켜져 있지 않고,
 * 브라우저 localStorage 는 이관 직후에 지워지기 때문이다.
 *
 * 그래서 이 스크립트는 TEST_DATABASE_URL 만 받고, 그 값이 DATABASE_URL 과
 * 같으면 아무것도 하지 않고 멈춘다.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabase } from '../lib/test-database.ts';

const testUrl = process.env.TEST_DATABASE_URL;
const devUrl = process.env.DATABASE_URL;
assertTestDatabase(testUrl);

if (!testUrl) {
  console.error("TEST_DATABASE_URL 이 없습니다. .env 를 확인하세요.");
  process.exit(1);
}
if (testUrl === devUrl) {
  console.error(
    "TEST_DATABASE_URL 이 DATABASE_URL 과 같습니다. 개발 DB 를 비울 뻔했습니다.",
  );
  process.exit(1);
}
if (!/test/i.test(testUrl)) {
  console.error(
    `안전장치: 이름에 test 가 없는 데이터베이스는 비우지 않습니다 — ${testUrl}`,
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testUrl }),
});

await prisma.$executeRawUnsafe(
  'TRUNCATE TABLE "completion", "issue", "project_note", "custom_project" RESTART IDENTITY CASCADE',
);
await prisma.appSetting.deleteMany({ where: { key: "board" } });
await prisma.$disconnect();

console.log("테스트 DB 를 비웠습니다.");
