import assert from "node:assert/strict";
import test from "node:test";

const menu = await import("./workspace-menu.ts").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

const companyProject = { slug: "company", title: "회사", categories: [] };
const personalProject = { slug: "personal-ilchul", scope:'PERSONAL', title: "일출", categories: [] };

test("소유자는 전체 업무 영역을 사용한다", () => {
  assert.equal(typeof menu.workspaceSectionIds, "function");
  assert.deepEqual(
    menu.workspaceSectionIds("OWNER", [companyProject, personalProject]),
    ["today", "projects", "personal", "recruitment", "records", "ai-ops", "settings", "guide"],
  );
});

test("관리자와 멤버는 서버가 허용한 프로젝트 영역만 탐색한다", () => {
  assert.deepEqual(
    menu.workspaceSectionIds("ADMIN", [companyProject, personalProject]),
    ["projects", "personal", "settings"],
  );
  assert.deepEqual(menu.workspaceSectionIds("MEMBER", [companyProject]), ["projects"]);
  assert.deepEqual(
    menu.workspaceSectionIds("MEMBER", [companyProject, personalProject]),
    ["projects", "personal"],
  );
  assert.deepEqual(menu.workspaceSectionIds("MEMBER", []), []);
  assert.deepEqual(menu.workspaceSectionIds("MEMBER", [personalProject]), ["personal"]);
  assert.deepEqual(menu.workspaceSectionIds("ADMIN", []), ["settings"]);
});

test("일반 계정의 개인 프로젝트 메뉴는 권한 있는 프로젝트 기록으로 이동한다", () => {
  assert.equal(typeof menu.workspaceSectionHref, "function");
  assert.equal(menu.workspaceSectionHref("personal", "OWNER", [personalProject]), "/personal");
  assert.equal(
    menu.workspaceSectionHref("personal", "MEMBER", [companyProject, personalProject]),
    "/flows/personal-ilchul/notes",
  );
});

test("계정 역할을 사이드바에서 읽을 수 있는 이름으로 표시한다", () => {
  assert.equal(typeof menu.workspaceRoleLabel, "function");
  assert.equal(menu.workspaceRoleLabel("OWNER"), "소유자");
  assert.equal(menu.workspaceRoleLabel("ADMIN"), "관리자");
  assert.equal(menu.workspaceRoleLabel("MEMBER"), "멤버");
});

test("일반 계정에 전달하는 개인 프로젝트 분류는 접근 가능한 프로젝트로 제한한다", () => {
  assert.equal(typeof menu.scopePersonalProjectGroups, "function");
  assert.deepEqual(
    menu.scopePersonalProjectGroups(
      { exists: true, values: { "personal-ilchul": "portfolio", "personal-secret": "toy" } },
      [personalProject],
    ),
    { exists: true, values: { "personal-ilchul": "portfolio" } },
  );
});
