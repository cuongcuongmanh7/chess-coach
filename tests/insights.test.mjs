import assert from "node:assert/strict";
import test from "node:test";
import {
  colorForUsername,
  hourInsights,
  lengthInsights,
  localHourFromPlayedAt,
  openingInsights,
  outcomeFor,
  overallTotals,
} from "../src/features/analysis/insights.ts";

test("xác định màu và kết quả theo góc nhìn người chơi", () => {
  assert.equal(colorForUsername("Me", "You", "me"), "w");
  assert.equal(colorForUsername("You", "Me", "me"), "b");
  assert.equal(colorForUsername("A", "B", "me"), null);
  assert.equal(outcomeFor("1-0", "w"), "win");
  assert.equal(outcomeFor("1-0", "b"), "loss");
  assert.equal(outcomeFor("1/2-1/2", "w"), "draw");
  assert.equal(outcomeFor("*", "w"), "unknown");
  assert.equal(outcomeFor("1-0", null), "unknown");
});

test("giờ địa phương chỉ suy ra khi có phần thời gian", () => {
  assert.equal(localHourFromPlayedAt("2026-07-20"), null);
  assert.equal(typeof localHourFromPlayedAt("2026-07-20 09:30:00"), "number");
  assert.equal(localHourFromPlayedAt("rác"), null);
});

const games = [
  { white: "me", black: "x", result: "1-0", opening: "Sicilian", eco: "B20", time_class: "blitz", played_at: "2026-07-20 09:00:00", ply_count: 30 },
  { white: "x", black: "me", result: "1-0", opening: "Sicilian", eco: "B20", time_class: "blitz", played_at: "2026-07-20 09:30:00", ply_count: 90 },
  { white: "me", black: "x", result: "1/2-1/2", opening: "Sicilian", eco: "B20", time_class: "blitz", played_at: "2026-07-20 10:00:00", ply_count: 50 },
  { white: "me", black: "y", result: "*", opening: "Ruy Lopez", eco: "C60", time_class: "rapid", played_at: null, ply_count: 20 },
];

test("tổng kết bỏ qua ván không xác định được kết quả", () => {
  const totals = overallTotals(games, "me");
  assert.equal(totals.games, 3);
  assert.equal(totals.wins, 1);
  assert.equal(totals.draws, 1);
  assert.equal(totals.losses, 1);
  assert.equal(totals.scoreRate, 50);
});

test("gộp theo opening với W/D/L", () => {
  const [sicilian] = openingInsights(games, "me");
  assert.equal(sicilian.key, "Sicilian");
  assert.equal(sicilian.games, 3);
  assert.equal(sicilian.wins, 1);
  assert.equal(sicilian.losses, 1);
});

test("nhịp độ theo giờ và độ dài ván", () => {
  const hours = hourInsights(games, "me");
  assert.equal(hours.available, true);
  assert.ok(hours.buckets.every((bucket) => bucket.hour >= 0 && bucket.hour <= 23));
  const lengths = lengthInsights(games, "me");
  assert.ok(lengths.length >= 1);
  assert.equal(lengths.reduce((sum, bucket) => sum + bucket.games, 0), 3);
});
