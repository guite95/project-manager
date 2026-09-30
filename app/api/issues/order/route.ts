import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { reorderIssues } from "@/lib/server/board-store";
import { taskResponse } from '@/lib/access/http';

export async function PUT(request: Request) {
  return taskResponse(async access => {
    const body = await readJson(request);
    await reorderIssues(asStringArray(body.ids), access);
    return new NextResponse(null, { status: 204 });
  });
}
