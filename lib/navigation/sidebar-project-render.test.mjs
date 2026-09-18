import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const previousTsxLoader = require.extensions[".tsx"];
require.extensions[".tsx"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const { SidebarProject } = require("../../components/shell/sidebar-project.tsx");
if (previousTsxLoader) require.extensions[".tsx"] = previousTsxLoader;
else delete require.extensions[".tsx"];

test("일반 계정은 프로젝트 펼침 버튼을 유지하고 순서 이동 손잡이만 숨긴다", () => {
  const html = renderToStaticMarkup(
    createElement(SidebarProject, {
      slug: "allowed-project",
      title: "허용된 프로젝트",
      count: 2,
      collapsed: true,
      onToggle: () => undefined,
      movable: false,
      showMoveHandle: false,
      dragging: null,
      onDragChange: () => undefined,
      onMove: () => undefined,
      onStep: () => undefined,
      children: "메뉴",
    }),
  );

  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /순서 이동/);
});
