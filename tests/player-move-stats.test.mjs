import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlayerMoveStats,
  playerColorForUsername,
} from "../src/features/analysis/playerMoveStats.ts";

test("xác định đúng màu của hồ sơ, không phân biệt hoa thường", () => {
  const headers = { White: "CuongKool", Black: "Opponent" };
  assert.equal(playerColorForUsername(headers, "cuongkool"), "w");
  assert.equal(playerColorForUsername(headers, "OPPONENT"), "b");
  assert.equal(playerColorForUsername(headers, "someone-else"), null);
});

test("chỉ đếm các nước đã phân tích của đúng màu người chơi", () => {
  const steps = [
    { ply: 1, color: "w" },
    { ply: 2, color: "b" },
    { ply: 3, color: "w" },
    { ply: 4, color: "b" },
    { ply: 5, color: "w" },
  ];
  const engineCache = {
    1: { quality: "best" },
    2: { quality: "blunder" },
    3: { quality: "good", displayQuality: "brilliant" },
    4: { quality: "mistake" },
  };

  assert.deepEqual(buildPlayerMoveStats(steps, engineCache, "w"), {
    brilliant: 1,
    best: 1,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  });
});
