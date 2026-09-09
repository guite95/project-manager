import { NextResponse } from "next/server";
import { deleteCustomProject } from "@/lib/server/board-store";

type Context = { params: Promise<{ slug: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { slug } = await context.params;
  await deleteCustomProject(slug);
  return new NextResponse(null, { status: 204 });
}
