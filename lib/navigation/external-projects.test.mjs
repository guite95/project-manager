import assert from "node:assert/strict";
import test from "node:test";
import {
  externalProjects,
  filterExternalProjects,
} from "./external-projects.ts";

const expectedFocusAiProject = {
  slug: "focus-ai",
  title: "포커스에이아이",
  links: [
    {
      title: "NotebookLM",
      href: "https://notebook.google.com/notebook/a17b9008-778c-407a-8ca0-08bd2e8a0f2e?authuser=2",
    },
  ],
};

test("검색어가 없으면 포커스에이아이 NotebookLM 링크를 제공한다", () => {
  assert.deepEqual(filterExternalProjects(externalProjects, ""), [
    expectedFocusAiProject,
  ]);
});

test("프로젝트 이름으로 검색하면 프로젝트의 링크를 모두 유지한다", () => {
  assert.deepEqual(
    filterExternalProjects(externalProjects, "포커스에이아이"),
    [expectedFocusAiProject]
  );
});

test("링크 이름 검색은 대소문자를 구분하지 않는다", () => {
  assert.deepEqual(filterExternalProjects(externalProjects, "notebooklm"), [
    expectedFocusAiProject,
  ]);
});

test("일치하지 않는 검색어는 빈 목록을 반환한다", () => {
  assert.deepEqual(filterExternalProjects(externalProjects, "없는 메뉴"), []);
});
