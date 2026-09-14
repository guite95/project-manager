import assert from "node:assert/strict";
import test from "node:test";
import {
  filterExternalProjects,
} from "./external-projects.ts";

const sampleProject = {
  slug: "sample",
  title: "샘플 프로젝트",
  links: [
    {
      title: "Guide",
      href: "https://example.com/guide",
    },
  ],
};

const sampleProjects = [sampleProject];

test("검색어가 없으면 외부 프로젝트 목록을 유지한다", () => {
  assert.deepEqual(filterExternalProjects(sampleProjects, ""), [
    sampleProject,
  ]);
});

test("프로젝트 이름으로 검색하면 프로젝트의 링크를 모두 유지한다", () => {
  assert.deepEqual(
    filterExternalProjects(sampleProjects, "샘플 프로젝트"),
    [sampleProject]
  );
});

test("링크 이름 검색은 대소문자를 구분하지 않는다", () => {
  assert.deepEqual(filterExternalProjects(sampleProjects, "guide"), [
    sampleProject,
  ]);
});

test("일치하지 않는 검색어는 빈 목록을 반환한다", () => {
  assert.deepEqual(filterExternalProjects(sampleProjects, "없는 메뉴"), []);
});
