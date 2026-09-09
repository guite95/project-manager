import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { reorderIssues } from "@/lib/server/board-store";

export async function PUT(request: Request) {
  const body = await readJson(request);
  await reorderIssues(asStringArray(body.ids));
  return new NextResponse(null, { status: 204 });
}
