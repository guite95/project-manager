import { NextResponse } from "next/server";
import { createId, jsonError, readJson } from "@/lib/api-types";
import { createCustomProject } from "@/lib/server/board-store";

export async function POST(request: Request) {
  const body = await readJson(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return jsonError("이름이 비어 있습니다.", 400);

  const project = await createCustomProject({
    slug: createId("custom"),
    title,
    now: new Date().toISOString(),
  });
  return NextResponse.json(project, { status: 201 });
}
