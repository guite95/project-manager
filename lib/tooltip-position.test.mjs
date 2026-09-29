import assert from "node:assert/strict";
import test from "node:test";

import { calculateTooltipPosition } from "./tooltip-position.ts";

test("tooltip stays inside the viewport near the right edge", () => {
  assert.deepEqual(
    calculateTooltipPosition(
      { left: 940, right: 988, top: 120, bottom: 140 },
      { width: 240, height: 80 },
      { width: 1000, height: 768 },
    ),
    { left: 752, top: 146 },
  );
});

test("tooltip opens above the trigger when there is not enough room below", () => {
  assert.deepEqual(
    calculateTooltipPosition(
      { left: 120, right: 320, top: 700, bottom: 724 },
      { width: 280, height: 120 },
      { width: 1000, height: 768 },
    ),
    { left: 80, top: 574 },
  );
});
