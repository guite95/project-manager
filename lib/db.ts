import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma 7 은 쿼리 컴파일러를 쓰므로 Rust 엔진 대신 드라이버 어댑터로 붙는다.
 * `pg` 는 순수 자바스크립트라 컨테이너 이미지에 네이티브 바이너리가 들어가지 않는다.
 *
 * 개발 중 핫리로드가 연결을 계속 새로 열지 않도록 전역에 하나만 둔다.
 * 프로덕션은 프로세스가 하나뿐이라 전역에 붙이지 않는다.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 이 없습니다. .env 를 확인하세요.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
