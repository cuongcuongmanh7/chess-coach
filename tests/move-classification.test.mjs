import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyExpectedPoints,
  expectedPointsFromCp,
  normalizeEngineAnalysis,
} from "../src/features/analysis/moveClassification.ts";
import { getBoardMoveBadge } from "../src/features/analysis/boardUtils.ts";

const sacrificeStep = {
  ply: 1,
  moveNumber: 1,
  color: "w",
  san: "Bxh7+",
  lan: "d3h7",
  from: "d3",
  to: "h7",
  fenBefore: "6k1/7p/8/8/8/3B4/8/6K1 w - - 0 1",
  fenAfter: "6k1/7B/8/8/8/8/8/6K1 b - - 0 1",
  phase: "Trung cuộc",
  quality: "good",
  title: "",
  comment: "",
  insight: "",
  tags: [],
  arrows: [],
  clockSeconds: null,
  thinkTimeSeconds: null,
  isQuickMove: false,
  isTimePressure: false,
};

function engine(overrides = {}) {
  return {
    whiteScoreCp: 35,
    centipawnLoss: 5,
    quality: "best",
    playedMoveUci: "d3h7",
    bestMoveUci: "d3h7",
    bestReplyUci: "g8h7",
    variations: [
      { rank: 1, evaluation: "+0.40", whiteScoreCp: 40 },
      { rank: 2, evaluation: "−0.40", whiteScoreCp: -40 },
    ],
    ...overrides,
  };
}

test("Expected Points giảm theo lợi thế của bên vừa đi", () => {
  assert.ok(expectedPointsFromCp(100, 1200) > 0.5);
  assert.ok(expectedPointsFromCp(-100, 1200) < 0.5);
  assert.ok(expectedPointsFromCp(100, 2000) > expectedPointsFromCp(100, 800));
});

test("phân loại theo các ngưỡng Expected Points", () => {
  assert.equal(classifyExpectedPoints(0, -10, false, 1200).quality, "good");
  assert.equal(classifyExpectedPoints(0, -35, false, 1200).quality, "inaccuracy");
  assert.equal(classifyExpectedPoints(0, -80, false, 1200).quality, "mistake");
  assert.equal(classifyExpectedPoints(0, -200, false, 1200).quality, "blunder");
  assert.equal(classifyExpectedPoints(0, -200, true, 1200).quality, "best");
});

test("nhận Brilliant khi nước gần tối ưu tạo hy sinh quân trong thế cạnh tranh", () => {
  const result = normalizeEngineAnalysis(sacrificeStep, engine(), 1200);
  assert.equal(result.quality, "best");
  assert.equal(result.displayQuality, "brilliant");
  assert.equal(getBoardMoveBadge(sacrificeStep, result), "brilliant");
});

test("không gắn Brilliant khi đã thắng áp đảo hoặc hy sinh không đủ chuẩn Elo cao", () => {
  const alreadyWinning = normalizeEngineAnalysis(
    sacrificeStep,
    engine({
      whiteScoreCp: 780,
      moverScoreBeforeCp: 800,
      moverScoreAfterCp: 780,
    }),
    1200,
  );
  const highRated = normalizeEngineAnalysis(sacrificeStep, engine(), 2200);

  assert.equal(alreadyWinning.displayQuality, "best");
  assert.equal(highRated.displayQuality, "best");
});

test("tàn cuộc chỉ Brilliant khi phương án thứ hai kém rõ rệt", () => {
  const endgameStep = { ...sacrificeStep, phase: "Tàn cuộc" };
  const notUnique = normalizeEngineAnalysis(
    endgameStep,
    engine({
      variations: [
        { rank: 1, evaluation: "+0.40", whiteScoreCp: 40 },
        { rank: 2, evaluation: "+0.35", whiteScoreCp: 35 },
      ],
    }),
    1200,
  );
  assert.equal(notUnique.displayQuality, "best");
});
