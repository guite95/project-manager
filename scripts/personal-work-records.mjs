import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { prisma } from "../lib/db.ts";
import { PERSONAL_WORK_RECORDS_KEY, parsePersonalWorkRecords } from "../lib/personal-work-records.ts";

const command = process.argv[2];
try {
  if (command === "inspect") {
    const row = await prisma.appSetting.findUnique({ where: { key: PERSONAL_WORK_RECORDS_KEY } });
    console.log(JSON.stringify({ key: PERSONAL_WORK_RECORDS_KEY, exists: Boolean(row),
      projects: row ? parsePersonalWorkRecords(row.value).projects.map(p => ({ id: p.id, groups: p.groups.length })) : [] }));
  } else if (command === "import" || command === "verify") {
    const report = parsePersonalWorkRecords(JSON.parse(readFileSync(new URL("../data/personal/work-records-2026-09-16.json", import.meta.url), "utf8")));
    const bytes = readFileSync(new URL("../data/personal/git-evidence-2026-09-16.json", import.meta.url));
    if (createHash("sha256").update(bytes).digest("hex") !== report.evidenceSha256) throw new Error("근거 파일 해시 불일치");
    const evidence = JSON.parse(bytes);
    for (const project of report.projects) {
      const source = evidence.projects.find(p => p.id === project.id);
      if (!source || source.commits.length !== project.commitCount) throw new Error("프로젝트 근거 개수 불일치");
      for (const commit of [...project.latest, ...project.groups.flatMap(group => group.commits)]) {
        const original = source.commits.find(c => c.hash === commit.hash);
        if (!original || original.email !== "ju@pooolingforest.com" || original.subject !== commit.subject
          || original.authoredAt.slice(0, 10) !== commit.date) throw new Error("커밋 근거 불일치");
      }
    }
    // create만 허용한다. 같은 날짜의 기존 기록은 덮어쓰지 않는다.
    if (command === "import") await prisma.appSetting.create({ data: { key: PERSONAL_WORK_RECORDS_KEY, value: report } });
    const row = await prisma.appSetting.findUniqueOrThrow({ where: { key: PERSONAL_WORK_RECORDS_KEY } });
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    if (JSON.stringify(canonical(row.value)) !== JSON.stringify(canonical(report))) throw new Error("DB 재조회 불일치");
    console.log(JSON.stringify({ verified: true, key: row.key, projects: report.projects.length,
      groups: report.projects.reduce((sum, project) => sum + project.groups.length, 0), evidenceSha256: report.evidenceSha256 }));
  } else throw new Error("사용법: pnpm db:shared -- node scripts/personal-work-records.mjs inspect|import|verify");
} finally {
  await prisma.$disconnect();
}
