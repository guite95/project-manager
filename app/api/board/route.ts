import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/server/board-store";
import { todayDateString } from "@/lib/today-board";
import { taskResponse } from '@/lib/access/http';
import { listScheduleTasks } from '@/lib/server/task-schedule-store';

/** 롤오버가 매 요청 판정되어야 하므로 캐시하지 않는다. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return taskResponse(async access => {
    if (new URL(request.url).searchParams.get('view') === 'gantt') return NextResponse.json(await listScheduleTasks(access));
    return NextResponse.json(await loadBoard(todayDateString(new Date()), access));
  });
}
