import { currentActor } from '../access/http';
import { NextResponse } from "next/server";
import { AiOpsInputError, createLazyPool } from "./store.mjs";
const globalPool = globalThis as typeof globalThis & {
  aiOpsPool?: ReturnType<typeof createLazyPool>;
};
export const pool = (globalPool.aiOpsPool ??= createLazyPool());
export async function aiOpsRead(action: () => Promise<unknown>) {
  const actor = await currentActor();
  const headers = { "Cache-Control": "private, no-store" };
  if (actor?.role !== 'OWNER')
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401, headers },
    );
  try {
    const data = await action();
    return NextResponse.json(data ?? { error: "세션을 찾을 수 없습니다." }, {
      status: data === null ? 404 : 200,
      headers,
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42P01"
    )
      return NextResponse.json(
        {
          error:
            "AI 활동 저장소 설정이 필요합니다. 데이터베이스 마이그레이션을 적용한 뒤 다시 시도해 주세요.",
        },
        { status: 503, headers },
      );
    return NextResponse.json(
      {
        error:
          error instanceof AiOpsInputError
            ? error.message
            : "AI 활동을 불러오지 못했습니다.",
      },
      { status: error instanceof AiOpsInputError ? 400 : 500, headers },
    );
  }
}
