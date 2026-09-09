import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-types";
import { prisma } from "@/lib/db";
import { BOARD_SETTING_KEY } from "@/lib/server/board-store";
import { listCompletions } from "@/lib/server/history-store";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return jsonError("from 과 to 는 YYYY-MM-DD 형식이어야 합니다.", 400);
  }
  if (from > to) return jsonError("from 이 to 보다 늦습니다.", 400);

  const [completions, projects, setting] = await Promise.all([
    listCompletions(from, to),
    prisma.customProject.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.appSetting.findUnique({ where: { key: BOARD_SETTING_KEY } }),
  ]);

  const value = (setting?.value ?? {}) as { projectOrder?: unknown };
  const projectOrder = Array.isArray(value.projectOrder)
    ? value.projectOrder.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];

  return NextResponse.json({
    completions,
    customProjects: projects.map((project) => ({
      slug: project.slug,
      title: project.title,
      createdAt: project.createdAt.toISOString(),
    })),
    projectOrder,
  });
}
