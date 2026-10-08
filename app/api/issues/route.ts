import { NextResponse } from "next/server";
import { createId, jsonError, readJson } from "@/lib/api-types";
import { createIssue, IssueProjectHiddenError } from "@/lib/server/board-store";
import { jsonBody, taskResponse } from '@/lib/access/http';
import { parseIssueSchedule, TaskScheduleError } from '@/lib/task-schedule';

export async function POST(request: Request) {
  return taskResponse(async access => {
    const body = await readJson(request.clone());
    const projectSlug =
      typeof body.projectSlug === "string" ? body.projectSlug : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!projectSlug) return jsonError("프로젝트를 지정해야 합니다.", 400);
    if (!title) return jsonError("제목이 비어 있습니다.", 400);

    try {
      if (body.schedule !== undefined) await jsonBody(request);
      const schedule = body.schedule === undefined ? undefined : parseIssueSchedule(body.schedule);
      if (schedule && schedule.revision !== 0) return jsonError('새 일정의 버전은 0이어야 합니다.', 400);
      const issue = await createIssue({
        id: createId("issue"),
        projectSlug,
        title,
        now: new Date().toISOString(),
        schedule,
      }, access);
      return NextResponse.json(issue, { status: 201 });
    } catch (error) {
      if (error instanceof IssueProjectHiddenError || error instanceof TaskScheduleError) return jsonError(error.message, error.status);
      throw error;
    }
  });
}
