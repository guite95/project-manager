import { NextResponse } from "next/server";

/** 이슈·프로젝트·완료 이력 id 를 만든다. 서버에서 만들어 클라이언트와 어긋나지 않게 한다. */
export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/** 본문이 JSON 이 아니면 빈 객체로 다룬다. */
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // 아래에서 빈 객체를 돌려준다.
  }
  return {};
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
