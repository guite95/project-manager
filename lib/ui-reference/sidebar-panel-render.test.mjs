import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const previousLoaders = Object.fromEntries([".ts", ".tsx"].map(extension => [extension, require.extensions[extension]]));
let DualSidebar;
try {
  const load = (module, filename) => {
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
  require.extensions[".ts"] = load;
  require.extensions[".tsx"] = load;
  ({ DualSidebar } = require("../../components/erp/zespro/components/dual-sidebar.tsx"));
} finally {
  for (const [extension, previousLoader] of Object.entries(previousLoaders)) {
    if (previousLoader) require.extensions[extension] = previousLoader;
    else delete require.extensions[extension];
  }
}

const groups = [{ id: "work", railLabel: "작업", title: "작업 메뉴", items: [{ label: "작업 목록", href: "/work" }] }];

test("접기 버튼은 레일이 아닌 패널 헤더에 있고 패널과 접근성 속성으로 연결된다", () => {
  const html = renderToStaticMarkup(createElement(DualSidebar, { groups, currentPath: "/work" }));
  const rail = html.match(/<nav[^>]*class="pds-dual-sidebar__rail"[\s\S]*?<\/nav>/)?.[0];
  const header = html.match(/<header[\s\S]*?<\/header>/)?.[0];
  assert.ok(rail);
  assert.doesNotMatch(rail, /세부 메뉴 접기/);
  assert.match(header, /aria-label="세부 메뉴 접기"/);
  assert.match(header, /aria-controls="[^"]+" aria-expanded="true"/);
  assert.match(html, /aria-current="page"/);
});

test("접힌 초기 상태도 레일은 유지하고 펼치기 버튼은 숨겨진 패널 헤더에 둔다", () => {
  const html = renderToStaticMarkup(createElement(DualSidebar, { groups, defaultPanelCollapsed: true }));
  const rail = html.match(/<nav[^>]*class="pds-dual-sidebar__rail"[\s\S]*?<\/nav>/)?.[0];
  assert.match(rail, /작업/);
  assert.doesNotMatch(rail, /세부 메뉴 펼치기/);
  assert.match(html, /hidden="" class="pds-dual-sidebar__panel"/);
  assert.match(html, /aria-label="세부 메뉴 펼치기"[^>]*aria-expanded="false"/);
});
