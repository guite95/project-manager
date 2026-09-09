import type { Completion } from "../completions.ts";
import { prisma } from "../db.ts";

/** from 과 to 를 모두 포함한다. 둘 다 로컬 기준 YYYY-MM-DD. */
export async function listCompletions(
  from: string,
  to: string,
): Promise<Completion[]> {
  const rows = await prisma.completion.findMany({
    where: { completedOn: { gte: from, lte: to } },
    orderBy: [{ completedOn: "desc" }, { completedAt: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    projectSlug: row.projectSlug,
    title: row.title,
    completedOn: row.completedOn,
    completedAt: row.completedAt.toISOString(),
  }));
}
