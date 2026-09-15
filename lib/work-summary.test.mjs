import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEvidence,
  parseSummaryDraft,
  validWorkDate,
} from "./work-summary.ts";
const evidence = {
  version: 1,
  date: "2026-09-14",
  timezone: "Asia/Seoul",
  collectedAt: "2026-09-14T04:00:00.000Z",
  expectedRevision: 0,
  target: "test",
  projects: [
    { key: "app:alpha", title: "Alpha" },
    { key: "repo:beta", title: "beta" },
  ],
  repositories: [],
  sources: [
    {
      id: "c:1",
      kind: "completion",
      projectKey: "app:alpha",
      title: "권한 개선",
      completionId: "1",
      completedAt: "2026-09-14T03:00:00.000Z",
    },
    {
      id: "g:1",
      kind: "git",
      projectKey: "app:alpha",
      title: "권한 검증 추가",
      repository: "alpha",
      commit: "a".repeat(40),
      authorEmail: "me@example.com",
      authoredAt: "2026-09-14T01:00:00Z",
      committedAt: "2026-09-14T01:00:00Z",
      merge: false,
    },
    {
      id: "g:2",
      kind: "git",
      projectKey: "repo:beta",
      title: "권한 검증 추가",
      repository: "beta",
      commit: "b".repeat(40),
      authorEmail: "me@example.com",
      authoredAt: "2026-09-14T01:00:00Z",
      committedAt: "2026-09-14T01:00:00Z",
      merge: false,
    },
  ],
};
const draft = {
  items: [
    {
      projectKey: "app:alpha",
      title: "로그인 권한 검증 개선",
      sourceIds: ["c:1", "g:1"],
    },
  ],
  excluded: [{ sourceId: "g:2", reason: "별도 확인 필요" }],
};
test("exact calendar dates and a complete traceable summary", () => {
  assert.equal(validWorkDate("2026-02-30"), false);
  assert.equal(validWorkDate("2026-09-14"), true);
  assert.deepEqual(parseSummaryDraft(draft, parseEvidence(evidence)), draft);
});
test("reject missing, duplicate, invented sources and cross-project merging", () => {
  for (const change of [
    { ...draft, excluded: [] },
    {
      ...draft,
      excluded: [...draft.excluded, { sourceId: "g:1", reason: "duplicate" }],
    },
    { ...draft, excluded: [{ sourceId: "unknown", reason: "unknown" }] },
    {
      items: [
        {
          projectKey: "app:alpha",
          title: "권한 개선",
          sourceIds: ["c:1", "g:1", "g:2"],
        },
      ],
      excluded: [],
    },
  ])
    assert.throws(() => parseSummaryDraft(change, evidence));
});
test("reject corrupt evidence rather than treating missing sources as no work", () => {
  assert.throws(() => parseEvidence({ ...evidence, sources: null }));
  assert.throws(() =>
    parseEvidence({
      ...evidence,
      sources: [...evidence.sources, evidence.sources[0]],
    }),
  );
  assert.throws(() => parseEvidence({ ...evidence, date: "2026-02-30" }));
});
export { evidence, draft };
import { formatWorkSummary } from "./work-summary.ts";
test("copy only the visible organized list including common and unmapped projects", () => {
  const report = {
    version: 1,
    revision: 1,
    savedAt: evidence.collectedAt,
    evidence: {
      ...evidence,
      projects: [...evidence.projects, { key: "app:common", title: "공통" }],
    },
    summary: {
      items: [
        ...draft.items,
        { projectKey: "app:common", title: "일정 협의", sourceIds: ["c:2"] },
      ],
      excluded: draft.excluded,
    },
  };
  assert.equal(
    formatWorkSummary(report),
    "09/14 작업내용\n`Alpha`\n- 로그인 권한 검증 개선\n`공통`\n- 일정 협의",
  );
  assert.equal(
    formatWorkSummary({ ...report, summary: { items: [], excluded: [] } }),
    "",
  );
});
