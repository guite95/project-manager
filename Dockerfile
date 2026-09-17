# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# --- 의존성 ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- 빌드 ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma 클라이언트는 빌드 전에 만들어져 있어야 한다.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm exec prisma generate
RUN pnpm build

# --- 실행 ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=30001
ENV HOSTNAME=0.0.0.0

# standalone 출력에는 실행에 필요한 node_modules 만 들어 있다.
# 이 저장소에는 public 디렉터리가 없다. 나중에 만들면 여기서 함께 복사한다.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 마이그레이션을 컨테이너 시작 때 적용하려면 prisma CLI 와 스키마, 설정이 필요하다.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# pnpm 의 .bin 및 .pnpm 심볼릭 링크 대상을 함께 유지한다.
RUN rm -rf node_modules
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/lib/ai-ops ./lib/ai-ops
COPY --from=builder /app/scripts/ai-ops-ingest.mjs ./scripts/ai-ops-ingest.mjs
COPY --from=builder /app/scripts/ai-ops-search.mjs ./scripts/ai-ops-search.mjs
COPY --from=builder /app/scripts/sql/ai-ops-vector.sql ./scripts/sql/ai-ops-vector.sql

EXPOSE 30001
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node server.js"]
