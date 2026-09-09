import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api-types";
import { deleteNote, updateNote } from "@/lib/server/notes-store";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await readJson(request);

  const content = typeof body.content === "string" ? body.content : undefined;
  const priority = typeof body.priority === "string" ? body.priority : undefined;
  if (content === undefined && priority === undefined) {
    return jsonError("바꿀 내용이 없습니다.", 400);
  }

  await updateNote(id, { content, priority }, new Date().toISOString());
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  await deleteNote(id);
  return new NextResponse(null, { status: 204 });
}
