import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.ts";
import {
  parseEvidence,
  parseSummaryDraft,
  parseWorkSummary,
  validWorkDate,
  WorkSummaryError,
  type WorkSummary,
} from "../work-summary.ts";
function keyFor(date: string) {
  if (!validWorkDate(date))
    throw new WorkSummaryError("유효한 날짜가 필요합니다.");
  return `work-summary:${date}`;
}
export async function loadWorkSummary(
  date: string,
): Promise<WorkSummary | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: keyFor(date) },
  });
  return row ? parseWorkSummary(row.value) : null;
}
export async function listWorkSummaryDates() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: "work-summary:" } },
    select: { key: true },
    orderBy: { key: "desc" },
  });
  return rows
    .map((row) => row.key.slice("work-summary:".length))
    .filter(validWorkDate);
}
export async function saveWorkSummary(
  evidenceInput: unknown,
  draftInput: unknown,
  backupDirectory: string,
) {
  const evidence = parseEvidence(evidenceInput);
  const summary = parseSummaryDraft(draftInput, evidence);
  const key = keyFor(evidence.date);
  const current = await prisma.appSetting.findUnique({ where: { key } });
  const revision = current ? parseWorkSummary(current.value).revision : 0;
  if (revision !== evidence.expectedRevision)
    throw new WorkSummaryError(
      "작업 정리 버전이 변경되었습니다. 다시 수집하세요.",
    );
  const report: WorkSummary = {
    version: 1,
    revision: revision + 1,
    savedAt: new Date().toISOString(),
    evidence,
    summary,
  };
  const backup = JSON.stringify({
    key,
    value: current?.value ?? null,
    backedUpAt: new Date().toISOString(),
  });
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const backupPath = join(
    backupDirectory,
    `work-summary-${evidence.date}-${randomUUID()}-${hash(backup)}.json`,
  );
  await writeFile(backupPath, backup, { flag: "wx", mode: 0o600 });
  if (hash(await readFile(backupPath, "utf8")) !== hash(backup))
    throw new WorkSummaryError("백업 확인에 실패했습니다.");
  const value = JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue;
  if (current) {
    const result = await prisma.appSetting.updateMany({
      where: {
        key,
        value: {
          equals: current.value === null ? Prisma.JsonNull : current.value,
        },
      },
      data: { value },
    });
    if (result.count !== 1)
      throw new WorkSummaryError(
        "작업 정리 버전이 변경되었습니다. 다시 수집하세요.",
      );
  } else {
    try {
      await prisma.appSetting.create({ data: { key, value } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new WorkSummaryError(
          "작업 정리 버전이 변경되었습니다. 다시 수집하세요.",
        );
      throw error;
    }
  }
  return {
    date: evidence.date,
    revision: report.revision,
    backupPath,
    href: `/today/history?view=summary&date=${evidence.date}`,
  };
}
