import assert from "node:assert/strict";
import test from "node:test";

import { buttonClassName } from "../../components/erp/button-styles.ts";

test("compact icon buttons keep the shared button dimensions and danger treatment", () => {
  const className = buttonClassName({
    size: "icon-sm",
    variant: "danger-ghost",
  });

  assert.match(className, /h-\[26px\]/);
  assert.match(className, /w-\[26px\]/);
  assert.match(className, /p-0/);
  assert.match(className, /text-\[var\(--bi-error\)\]/);
  assert.match(className, /hover:bg-\[var\(--bi-error\)\]\/10/);
});

test("subtle icon buttons use muted text until interaction", () => {
  const className = buttonClassName({
    size: "icon-sm",
    variant: "subtle",
  });

  assert.match(className, /text-\[var\(--bi-muted\)\]/);
  assert.match(className, /hover:bg-\[var\(--bi-accent-light\)\]/);
  assert.match(className, /hover:text-\[var\(--bi-accent\)\]/);
});
