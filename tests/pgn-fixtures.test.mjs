import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyzePgn } from "../src/analysis.ts";

const fixtureDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "pgn",
);

async function analyzeFixture(name) {
  const pgn = await readFile(path.join(fixtureDirectory, name), "utf8");
  return analyzePgn(pgn);
}

test("đọc được toàn bộ bộ PGN fixture", async () => {
  for (const name of [
    "short-opening.pgn",
    "castling-en-passant.pgn",
    "promotion.pgn",
    "checkmate.pgn",
    "clocks.pgn",
    "clear-mistake.pgn",
  ]) {
    const analysis = await analyzeFixture(name);
    assert.ok(analysis.steps.length > 0, `${name} phải có nước đi`);
  }
});

test("giữ đúng nhập thành và en passant", async () => {
  const analysis = await analyzeFixture("castling-en-passant.pgn");
  assert.ok(analysis.steps.some((step) => step.san === "exd6"));
  assert.equal(analysis.steps.filter((step) => step.san === "O-O").length, 2);
});

test("nhận diện phong cấp và chiếu hết", async () => {
  const promotion = await analyzeFixture("promotion.pgn");
  const checkmate = await analyzeFixture("checkmate.pgn");
  assert.ok(promotion.steps.at(-1)?.san.includes("=Q"));
  assert.ok(promotion.steps.at(-1)?.tags.includes("Phong cấp"));
  assert.ok(checkmate.steps.at(-1)?.san.endsWith("#"));
  assert.ok(checkmate.steps.at(-1)?.tags.includes("Chiếu hết"));
});

test("đọc clock comment và tính thời gian suy nghĩ", async () => {
  const analysis = await analyzeFixture("clocks.pgn");
  assert.equal(analysis.steps[0].clockSeconds, 297);
  assert.equal(analysis.steps[0].thinkTimeSeconds, 3);
  assert.equal(analysis.steps[2].thinkTimeSeconds, 7);
});

test("fixture lỗi rõ ràng tạo nhãn cần xem lại", async () => {
  const analysis = await analyzeFixture("clear-mistake.pgn");
  assert.ok(analysis.steps.some((step) => ["mistake", "blunder"].includes(step.quality)));
});
