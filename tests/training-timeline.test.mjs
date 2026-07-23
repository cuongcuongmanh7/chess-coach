import assert from "node:assert/strict";
import test from "node:test";
import {
  canOpenTrainingSession,
  getTrainingTimelineState,
} from "../src/features/training/timeline.ts";

function session(index, feedback = null, hintsUsed = 0, failedAttempts = 0) {
  return {
    index,
    fen: "",
    startedAt: 0,
    hintsUsed,
    failedAttempts,
    loading: false,
    feedback,
    attemptedMove: null,
    initialLoss: null,
    continuation: null,
  };
}

test("phân loại bài hiện tại, đã hoàn tất sạch và có hỗ trợ", () => {
  assert.equal(getTrainingTimelineState(session(2), 2, 2), "current");
  assert.equal(getTrainingTimelineState(session(0, { kind: "complete", message: "ok" }), 0, 2), "completed");
  assert.equal(getTrainingTimelineState(session(1, { kind: "complete", message: "ok" }, 1), 1, 2), "assisted");
  assert.equal(getTrainingTimelineState(undefined, 3, 2), "pending");
});

test("chỉ mở bài đã làm hoặc bài hiện tại", () => {
  assert.equal(canOpenTrainingSession(session(0, { kind: "complete", message: "ok" }), 0, 2), true);
  assert.equal(canOpenTrainingSession(session(2), 2, 2), true);
  assert.equal(canOpenTrainingSession(session(1), 1, 2), false);
  assert.equal(canOpenTrainingSession(undefined, 3, 2), false);
});
