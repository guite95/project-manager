import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const files = ["app", "components"].flatMap(directory =>
  readdirSync(`${root}${directory}`, { recursive: true })
    .filter(file => /\.[jt]sx$/.test(file))
    .map(file => `${directory}/${file}`),
);

function findNativeControls() {
  const selects = [];
  const duplicates = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(`${root}${file}`, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = node => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        const location = `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} <${tag}>`;
        if (tag === "select") selects.push(location);
        if (!file.startsWith("components/erp/")) {
          if (["textarea", "table", "dialog"].includes(tag)) duplicates.push(location);
          if (tag === "input") {
            const attribute = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === "type");
            const type = attribute?.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : "";
            // 파일 선택과 숨김 제출 값에는 레퍼런스의 대응 요소가 없다.
            if (!["file", "hidden"].includes(type)) duplicates.push(location);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { selects, duplicates };
}

const controls = findNativeControls();

test("선택 목록은 네이티브 select 대신 레퍼런스 Dropdown을 사용한다", () => {
  assert.deepEqual(controls.selects, [], "Dropdown/SelectField를 사용하세요.\n" + controls.selects.join("\n"));
});

test("화면은 일반 폼·표·모달을 공통 컴포넌트로 조합한다", () => {
  assert.deepEqual(controls.duplicates, [], "docs/ui-design.md의 대응 컴포넌트를 사용하세요.\n" + controls.duplicates.join("\n"));
});
