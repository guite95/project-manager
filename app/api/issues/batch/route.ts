import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api-types";
import { IssueBatchError, movePoolIssues } from "@/lib/server/board-store";
import { todayDateString } from "@/lib/today-board";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!Array.isArray(body.ids)) return jsonError("옮길 할 일 ID 목록이 필요합니다.", 400);

  try {
    const count = body.action === "today"
      ? await movePoolIssues({ ids: body.ids, action: "today", today: todayDateString(new Date()) })
      : body.action === "project" && typeof body.projectSlug === "string"
        ? await movePoolIssues({ ids: body.ids, action: "project", projectSlug: body.projectSlug })
        : null;
    if (count === null) return jsonError("이동 대상이 올바르지 않습니다.", 400);
    return NextResponse.json({ count });
  } catch (error) {
    if (error instanceof IssueBatchError) return jsonError(error.message, error.status);
    throw error;
  }
}
