import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { reorderNotes } from "@/lib/server/notes-store";

export async function PUT(request: Request, context: {params:Promise<{project:string}>}) {
  const body = await readJson(request);
  await reorderNotes(asStringArray(body.ids), (await context.params).project);
  return new NextResponse(null, { status: 204 });
}
