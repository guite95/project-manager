import { NextResponse } from "next/server";
import { deleteCustomProject } from "@/lib/server/board-store";
import { taskResponse } from '@/lib/access/http';

type Context = { params: Promise<{ slug: string }> };

export async function DELETE(_request: Request, context: Context) {
  return taskResponse(async access => {
    const { slug } = await context.params;
    await deleteCustomProject(slug, access);
    return new NextResponse(null, { status: 204 });
  });
}
