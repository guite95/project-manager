import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { reorderNotes } from "@/lib/server/notes-store";

export async function PUT(request: Request) {
  const body = await readJson(request);
  await reorderNotes(asStringArray(body.ids));
  return new NextResponse(null, { status: 204 });
}
