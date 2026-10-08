import { NextResponse } from "next/server";
import { createId, jsonError, readJson } from "@/lib/api-types";
import {
  deleteIssue,
  moveIssue,
  setIssueDone,
  setIssueTitle,
} from "@/lib/server/board-store";
import { todayDateString } from "@/lib/today-board";
import { jsonBody, taskResponse } from '@/lib/access/http';
import { parseIssueSchedule, TaskScheduleError } from '@/lib/task-schedule';
import { setIssueSchedule } from '@/lib/server/task-schedule-store';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return taskResponse(async access => {
    const { id } = await context.params;
    const body = await readJson(request.clone());
    const today = todayDateString(new Date());

    if (body.schedule !== undefined) {
      await jsonBody(request);
      if (Object.keys(body).length !== 1) return jsonError('일정 변경은 다른 수정과 별도로 저장해 주세요.', 400);
      try {
        return NextResponse.json(await setIssueSchedule(id, parseIssueSchedule(body.schedule), access));
      } catch (error) {
        if (error instanceof TaskScheduleError) return jsonError(error.message, error.status);
        throw error;
      }
    }

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

    if (title) await setIssueTitle(id, title, access);

    if (body.placement === "pool" || body.placement === "today") {
      await moveIssue(id, body.placement, today, access);
    }

    if (typeof body.done === "boolean") {
      await setIssueDone({
        id,
        done: body.done,
        completionId: createId("done"),
        today,
        now: new Date().toISOString(),
      }, access);
    }

    return new NextResponse(null, { status: 204 });
  });
}

export async function DELETE(_request: Request, context: Context) {
  return taskResponse(async access => {
    const { id } = await context.params;
    await deleteIssue(id, access);
    return new NextResponse(null, { status: 204 });
  });
}
