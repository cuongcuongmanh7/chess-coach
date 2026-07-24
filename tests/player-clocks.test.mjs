import assert from "node:assert/strict";
import test from "node:test";
import { playerClocksAtStep } from "../src/features/analysis/playerClocks.ts";

const steps = [
  { color: "w", clockSeconds: 300 },
  { color: "b", clockSeconds: 298 },
  { color: "w", clockSeconds: null },
  { color: "b", clockSeconds: 284 },
  { color: "w", clockSeconds: 276 },
];

test("lấy clock gần nhất của hai bên tại nước đang xem", () => {
  assert.deepEqual(playerClocksAtStep(steps, 0), { w: 300, b: null });
  assert.deepEqual(playerClocksAtStep(steps, 3), { w: 300, b: 284 });
  assert.deepEqual(playerClocksAtStep(steps, 4), { w: 276, b: 284 });
});
