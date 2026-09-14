import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api-types";
import { loadSidebarOrder, saveSidebarOrder, SidebarOrderError } from "@/lib/server/sidebar-store";

export async function GET() {
  return NextResponse.json({projectOrder:await loadSidebarOrder()});
}

export async function PUT(request: Request) {
  const body = await readJson(request);
  try {
    return NextResponse.json({projectOrder:await saveSidebarOrder(body.projectOrder)});
  } catch (error) {
    if (error instanceof SidebarOrderError) return jsonError(error.message, 400);
    return jsonError("프로젝트 순서를 저장하지 못했습니다.", 500);
  }
}
