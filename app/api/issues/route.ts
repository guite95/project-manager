import { NextResponse } from "next/server";
import { createId, jsonError, readJson } from "@/lib/api-types";
import { createIssue } from "@/lib/server/board-store";

export async function POST(request: Request) {
  const body = await readJson(request);
  const projectSlug =
    typeof body.projectSlug === "string" ? body.projectSlug : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!projectSlug) return jsonError("프로젝트를 지정해야 합니다.", 400);
  if (!title) return jsonError("제목이 비어 있습니다.", 400);

  const issue = await createIssue({
    id: createId("issue"),
    projectSlug,
    title,
    now: new Date().toISOString(),
  });
  return NextResponse.json(issue, { status: 201 });
}
