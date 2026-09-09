import { NextResponse } from "next/server";
import { createId } from "@/lib/api-types";
import { createNote, listNotes } from "@/lib/server/notes-store";

type Context = { params: Promise<{ project: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context) {
  const { project } = await context.params;
  return NextResponse.json(await listNotes(project));
}

export async function POST(_request: Request, context: Context) {
  const { project } = await context.params;
  const note = await createNote({
    id: createId("note"),
    projectSlug: project,
    now: new Date().toISOString(),
  });
  return NextResponse.json(note, { status: 201 });
}
