import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parsePersonalWorkRecords } from "./personal-work-records.ts";

const report = JSON.parse(readFileSync(new URL("../data/personal/work-records-2026-09-16.json", import.meta.url)));
const bytes = readFileSync(new URL("../data/personal/git-evidence-2026-09-16.json", import.meta.url));
const evidence = JSON.parse(bytes);

test("기여 기록의 모든 대표 커밋은 해당 프로젝트의 사용자 작성 원본과 일치한다", () => {
  parsePersonalWorkRecords(report);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), report.evidenceSha256);
  assert.equal(report.projects.length, 3);
  for (const project of report.projects) {
    const source = evidence.projects.find(p => p.id === project.id);
    assert.equal(project.commitCount, source.commits.length);
    assert.equal(new Set(source.commits.map(c => c.hash)).size, source.commits.length);
    assert.equal(project.mergeCount, source.excludedMerges.length);
    assert.ok(source.commits.every(c => !c.merge && c.email === "ju@pooolingforest.com"));
    for (const commit of [...project.latest, ...project.groups.flatMap(g => g.commits)]) {
      const original = source.commits.find(c => c.hash === commit.hash);
      assert.ok(original);
      assert.equal(commit.subject, original.subject);
      assert.equal(commit.date, original.authoredAt.slice(0, 10));
    }
  }
});

test("잘못된 DB 자료를 빈 기록이나 정상 기록으로 처리하지 않는다", () => {
  for (const value of [null, {}, { ...report, schemaVersion: 2 }, { ...report, projects: [report.projects[0], report.projects[0]] }]) {
    assert.throws(() => parsePersonalWorkRecords(value));
  }
  const broken = structuredClone(report);
  broken.projects[0].groups[0].commits[0].hash = "invalid";
  assert.throws(() => parsePersonalWorkRecords(broken));
});
