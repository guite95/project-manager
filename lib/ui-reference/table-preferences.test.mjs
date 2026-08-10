import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTablePreferences } from "./table-preferences.ts";

const COLUMNS = [
  {
    key: "code",
    label: "코드",
    defaultVisible: true,
    defaultWidth: 120,
    minWidth: 60,
    maxWidth: 240,
  },
  {
    key: "name",
    label: "이름",
    defaultVisible: true,
    defaultWidth: 240,
    minWidth: 120,
    maxWidth: 480,
  },
  {
    key: "qty",
    label: "수량",
    defaultVisible: true,
    defaultWidth: 90,
    minWidth: 60,
    maxWidth: 180,
  },
];

test("설정이 없으면 컬럼 정의의 기본 순서와 너비를 사용한다", () => {
  assert.deepEqual(normalizeTablePreferences(COLUMNS, undefined), {
    order: ["code", "name", "qty"],
    hidden: [],
    widths: { code: 120, name: 240, qty: 90 },
  });
});

test("손상되거나 오래된 컬럼 설정을 현재 기본값으로 정규화한다", () => {
  assert.deepEqual(
    normalizeTablePreferences(COLUMNS, {
      order: ["name", "missing", "name"],
      hidden: ["code", "missing"],
      widths: { name: 9999, code: 12, missing: 100 },
    }),
    {
      order: ["name", "code", "qty"],
      hidden: ["code"],
      widths: { name: 480, code: 60, qty: 90 },
    }
  );
});

test("잘못된 저장 타입은 전체 기본 설정으로 복구한다", () => {
  assert.deepEqual(normalizeTablePreferences(COLUMNS, "broken"), {
    order: ["code", "name", "qty"],
    hidden: [],
    widths: { code: 120, name: 240, qty: 90 },
  });
});

test("저장값이 모든 컬럼을 숨겨도 첫 번째 컬럼은 표시한다", () => {
  assert.deepEqual(
    normalizeTablePreferences(COLUMNS, {
      order: ["name", "qty", "code"],
      hidden: ["code", "name", "qty"],
      widths: {},
    }),
    {
      order: ["name", "qty", "code"],
      hidden: ["code", "qty"],
      widths: { code: 120, name: 240, qty: 90 },
    },
  );
});
