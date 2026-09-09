import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { saveSettings } from "@/lib/server/board-store";

export async function PUT(request: Request) {
  const body = await readJson(request);
  await saveSettings({
    projectOrder: asStringArray(body.projectOrder),
    collapsedProjects: asStringArray(body.collapsedProjects),
  });
  return new NextResponse(null, { status: 204 });
}
