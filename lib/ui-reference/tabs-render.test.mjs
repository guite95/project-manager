import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const previousLoaders = Object.fromEntries([".ts", ".tsx"].map(extension => [extension, require.extensions[extension]]));
let Tabs;
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
  ({ Tabs } = require("../../components/erp/zespro/components/tabs.tsx"));
} finally {
  for (const [extension, previousLoader] of Object.entries(previousLoaders)) {
    if (previousLoader) require.extensions[extension] = previousLoader;
    else delete require.extensions[extension];
  }
}

const items = [
  { key: "summary", label: "회의록", id: "meeting-summary", panelId: "summary-panel" },
  { key: "transcript", label: "전사본 원문", id: "meeting-transcript", panelId: "transcript-panel" },
];

test("공통 탭으로 교체해도 선택 탭만 Tab으로 접근하며 패널 연결을 유지한다", () => {
  const html = renderToStaticMarkup(createElement(Tabs, { items, value: "transcript", onChange() {}, ariaLabel: "회의록 보기" }));
  assert.match(html, /role="tablist" aria-label="회의록 보기"/);
  assert.match(html, /id="meeting-summary" aria-controls="summary-panel" aria-selected="false" tabindex="-1"/);
  assert.match(html, /id="meeting-transcript" aria-controls="transcript-panel" aria-selected="true" tabindex="0"/);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1);
});

test("선택 탭이 비활성화되면 활성 탭에 키보드 진입점을 남긴다", () => {
  const html = renderToStaticMarkup(createElement(Tabs, {
    items: [{ ...items[0], disabled: true }, items[1]], value: "summary", onChange() {},
  }));
  assert.match(html, /id="meeting-summary"[^>]*tabindex="-1"[^>]*disabled=""/);
  assert.match(html, /id="meeting-transcript"[^>]*tabindex="0"/);
});
