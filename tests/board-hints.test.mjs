import assert from "node:assert/strict";
import test from "node:test";
import {
  canControlPiece,
  getLegalMoveHints,
  toggleSquareHighlight,
} from "../src/shared/chess/boardHints.ts";

test("chỉ cho chọn quân đúng bên đang điều khiển và đến lượt", () => {
  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  assert.equal(canControlPiece(fen, "e2", "w"), true);
  assert.equal(canControlPiece(fen, "e7", "w"), false);
  assert.equal(canControlPiece(fen, "e7", "b"), false);
});

test("phân biệt ô có thể đi và ô có thể ăn", () => {
  const fen = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";
  const hints = getLegalMoveHints(fen, "e4", "w");
  assert.deepEqual(hints, [
    { square: "e5", kind: "move" },
    { square: "d5", kind: "capture" },
  ]);
});

test("không tạo gợi ý cho quân đối phương hoặc FEN không hợp lệ", () => {
  const fen = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";
  assert.deepEqual(getLegalMoveHints(fen, "d5", "w"), []);
  assert.deepEqual(getLegalMoveHints("invalid", "e4", "w"), []);
});

test("chuột phải bật/tắt độc lập nhiều ô highlight", () => {
  const first = toggleSquareHighlight(new Set(), "e4");
  const second = toggleSquareHighlight(first, "d5");
  const third = toggleSquareHighlight(second, "e4");

  assert.deepEqual([...first], ["e4"]);
  assert.deepEqual([...second], ["e4", "d5"]);
  assert.deepEqual([...third], ["d5"]);
});
