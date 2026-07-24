import assert from "node:assert/strict";
import test from "node:test";
import { selectBatchCandidates } from "../src/features/analysis/batchQueue.ts";

const games = [
  { id: "a", analysis_complete: false, time_class: "blitz" },
  { id: "b", analysis_complete: true, time_class: "blitz" },
  { id: "c", analysis_complete: false, time_class: "rapid" },
  { id: "d", analysis_complete: false, time_class: "blitz" },
];

test("chỉ chọn ván chưa phân tích", () => {
  const picked = selectBatchCandidates(games, "all", "all").map((game) => game.id);
  assert.deepEqual(picked, ["a", "c", "d"]);
});

test("lọc theo thể loại", () => {
  const picked = selectBatchCandidates(games, "blitz", "all").map((game) => game.id);
  assert.deepEqual(picked, ["a", "d"]);
});

test("cắt theo số lượng, giữ thứ tự đầu vào", () => {
  const picked = selectBatchCandidates(games, "all", 2).map((game) => game.id);
  assert.deepEqual(picked, ["a", "c"]);
});

test("không có ván phù hợp trả về mảng rỗng", () => {
  const allDone = games.map((game) => ({ ...game, analysis_complete: true }));
  assert.deepEqual(selectBatchCandidates(allDone, "all", "all"), []);
});
