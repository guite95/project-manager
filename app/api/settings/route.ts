import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { saveSettings } from "@/lib/server/board-store";
import { taskResponse } from '@/lib/access/http';

export async function PUT(request: Request) {
  return taskResponse(async access => {
    const body = await readJson(request);
    await saveSettings({
      projectOrder: asStringArray(body.projectOrder),
      collapsedProjects: asStringArray(body.collapsedProjects),
    }, access);
    return new NextResponse(null, { status: 204 });
  });
}
