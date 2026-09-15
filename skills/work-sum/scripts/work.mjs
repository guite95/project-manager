#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import {
  parseEvidence,
  parseSummaryDraft,
  validWorkDate,
  WorkSummaryError,
} from "../../../lib/work-summary.ts";
import { assertTestDatabase } from "../../../lib/test-database.ts";
import { todayInSeoul } from "../../../lib/format/date-time.ts";
const help = `work-sum (Node 22.18+, 저장소 의존성 필요)
projects                                      연결된 앱의 프로젝트 slug/title 조회
collect --output FILE [--date YYYY-MM-DD] [--root DIR] [--mapping FILE] [--authors EMAIL,EMAIL]
  기본: 한국 시간 오늘, ~/Documents/project, 저장소별 git user.email. 로컬 모든 ref/HEAD의 작성자 일치 커밋.
  --mapping JSON: {"루트 기준 저장소 경로":"앱 프로젝트 slug"}. 정확히 일치하는 경로 구간만 자동 연결.
validate --evidence FILE --file DRAFT           DB 연결 없이 증거 배정 검사, 검토 해시 출력
save --evidence FILE --file DRAFT --sha256 HASH [--backup-dir DIR]
  백업·버전 확인 후 앱의 완료 이력 > 작업 정리에 저장. 원본 완료 기록은 변경하지 않음.
DB 명령: pnpm db:shared -- node skills/work-sum/scripts/work.mjs ...
테스트 DB 외 직접 DATABASE_URL 연결은 허용하지 않습니다.`;
let db;
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      ...Object.fromEntries(
        [
          "output",
          "date",
          "root",
          "mapping",
          "authors",
          "evidence",
          "file",
          "sha256",
          "backup-dir",
        ].map((k) => [k, { type: "string" }]),
      ),
      help: { type: "boolean" },
    },
  });
  const required = (k) => {
    if (!values[k]) throw new WorkSummaryError(`--${k}가 필요합니다.`);
    return values[k];
  };
  const read = async (file) => {
    const raw = await readFile(file, "utf8");
    if (Buffer.byteLength(raw) > 10 * 1024 * 1024)
      throw new WorkSummaryError("입력은 10MB 이하여야 합니다.");
    return raw;
  };
  if (values.help) console.log(help);
  else {
    const command = positionals[0];
    if (
      positionals.length !== 1 ||
      !["projects", "collect", "validate", "save"].includes(command)
    )
      throw new WorkSummaryError(help);
    let evidence, draft, hash;
    if (command === "validate" || command === "save") {
      const a = await read(required("evidence"));
      const b = await read(required("file"));
      evidence = parseEvidence(JSON.parse(a));
      draft = parseSummaryDraft(JSON.parse(b), evidence);
      hash = createHash("sha256")
        .update(a)
        .update("\0")
        .update(b)
        .digest("hex");
    }
    if (command === "validate")
      console.log(
        JSON.stringify({
          status: "valid",
          date: evidence.date,
          items: draft.items.length,
          excluded: draft.excluded.length,
          sha256: hash,
        }),
      );
    else {
      if (process.env.SHARED_DATABASE !== "1")
        assertTestDatabase(process.env.DATABASE_URL);
      const target = process.env.SHARED_DATABASE === "1" ? "shared" : "test";
      db = (await import("../../../lib/db.ts")).prisma;
      const { loadWorkSummary, saveWorkSummary } =
        await import("../../../lib/server/work-summary-store.ts");
      if (command === "save") {
        if (evidence.target !== target)
          throw new WorkSummaryError(
            "수집 DB와 저장 DB가 다릅니다. 대상 DB에서 다시 수집하세요.",
          );
        if (required("sha256") !== hash)
          throw new WorkSummaryError(
            "검토한 파일 해시가 다릅니다. 다시 validate 하세요.",
          );
        console.log(
          JSON.stringify(
            await saveWorkSummary(
              evidence,
              draft,
              resolve(values["backup-dir"] ?? resolve(homedir(), "pm-backups")),
            ),
          ),
        );
      } else {
        const [flow, custom] = await Promise.all([
          db.flowProject.findMany({
            select: { slug: true, title: true },
            orderBy: { position: "asc" },
          }),
          db.customProject.findMany({ select: { slug: true, title: true } }),
        ]);
        const projects = [
          ...new Map([...flow, ...custom].map((p) => [p.slug, p])).values(),
        ];
        if (command === "projects") console.log(JSON.stringify(projects));
        else {
          const date = values.date ?? todayInSeoul();
          if (!validWorkDate(date))
            throw new WorkSummaryError("날짜 형식이 잘못되었습니다.");
          const mapping = values.mapping
            ? JSON.parse(await read(values.mapping))
            : {};
          if (
            !mapping ||
            typeof mapping !== "object" ||
            Array.isArray(mapping) ||
            Object.values(mapping).some((v) => typeof v !== "string")
          )
            throw new WorkSummaryError(
              "매핑은 저장소 상대 경로: 프로젝트 slug 객체여야 합니다.",
            );
          const authors =
            values.authors
              ?.split(",")
              .map((x) => x.trim())
              .filter(Boolean) ?? [];
          if (values.authors && !authors.length)
            throw new WorkSummaryError("작성자 이메일이 비어 있습니다.");
          const { collectGit } =
            await import("../../../lib/server/work-git.ts");
          const { listCompletions } =
            await import("../../../lib/server/history-store.ts");
          const [git, completions, current] = await Promise.all([
            collectGit(
              values.root ?? resolve(homedir(), "Documents/project"),
              date,
              projects.map((p) => ({ key: `app:${p.slug}`, title: p.title })),
              mapping,
              authors,
            ),
            listCompletions(date, date),
            loadWorkSummary(date),
          ]);
          for (const c of completions)
            if (!git.projects.some((p) => p.key === `app:${c.projectSlug}`))
              git.projects.push({
                key: `app:${c.projectSlug}`,
                title: c.projectSlug || "미분류",
              });
          const result = parseEvidence({
            version: 1,
            date,
            timezone: "Asia/Seoul",
            collectedAt: new Date().toISOString(),
            target,
            expectedRevision: current?.revision ?? 0,
            ...git,
            sources: [
              ...git.sources,
              ...completions.map((c) => ({
                id: `completion:${c.id}`,
                kind: "completion",
                projectKey: `app:${c.projectSlug}`,
                title: c.title,
                completionId: c.id,
                completedAt: c.completedAt,
              })),
            ],
          });
          await writeFile(
            resolve(required("output")),
            JSON.stringify(result, null, 2) + "\n",
            { flag: "wx", mode: 0o600 },
          );
          console.log(
            JSON.stringify({
              status: "collected",
              date,
              output: resolve(values.output),
              sources: result.sources.length,
              repositories: git.repositories,
              expectedRevision: result.expectedRevision,
            }),
          );
        }
      }
    }
  }
} catch (error) {
  console.error(
    error instanceof WorkSummaryError
      ? error.message
      : "work-sum 실행 실패: 인자·JSON·경로·파일 중복·DB 연결을 확인하세요.",
  );
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
}
