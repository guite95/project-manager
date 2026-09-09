import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/server/board-store";
import { todayDateString } from "@/lib/today-board";

/** 롤오버가 매 요청 판정되어야 하므로 캐시하지 않는다. */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadBoard(todayDateString(new Date())));
}
