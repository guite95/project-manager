import { NextResponse } from "next/server";
import { createId, jsonError, readJson } from "@/lib/api-types";
import {
  deleteIssue,
  moveIssue,
  setIssueDone,
  setIssueTitle,
} from "@/lib/server/board-store";
import { todayDateString } from "@/lib/today-board";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await readJson(request);
  const today = todayDateString(new Date());

  const title = typeof body.title === "string" ? body.title.trim() : undefined;

  if (
    body.placement === undefined &&
    body.done === undefined &&
    title === undefined
  ) {
    return jsonError("바꿀 내용이 없습니다.", 400);
  }
  if (title !== undefined && !title) {
    return jsonError("제목이 비어 있습니다.", 400);
  }

  if (title) await setIssueTitle(id, title);

  if (body.placement === "pool" || body.placement === "today") {
    await moveIssue(id, body.placement, today);
  }

  if (typeof body.done === "boolean") {
    await setIssueDone({
      id,
      done: body.done,
      completionId: createId("done"),
      today,
      now: new Date().toISOString(),
    });
  }

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  await deleteIssue(id);
  return new NextResponse(null, { status: 204 });
}
