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

let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  const cached = globalForPrisma.prisma ?? client;
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 이 없습니다. .env 를 확인하세요.");
  }

  client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

/**
 * 처음 실제로 쓸 때 연결한다.
 *
 * 모듈을 읽는 것만으로 연결하면 `next build` 가 깨진다. 빌드는 라우트 모듈을
 * 불러 정보를 모으는데, 그때는 DATABASE_URL 이 없다 (도커 빌드 단계에는 .env 가
 * 없다). 그래서 프록시로 감싸 첫 접근까지 미룬다.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const real = getClient() as unknown as Record<string | symbol, unknown>;
    const value = real[property];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
