import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateRequiresPromotion,
  prepareCandidateMove,
  prepareCandidateMoveFromFen,
} from "../src/features/candidate-lab/model.ts";
import { buildCandidateAnalysis } from "../src/features/candidate-lab/services/candidateAnalysis.ts";
import {
  completeCandidateTurn,
  createCandidateSessionState,
} from "../src/features/candidate-lab/branchState.ts";
import { moveSfxForSan } from "../src/sfx.ts";

const initialFen = "rn1qkbnr/ppp1pppp/3p4/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2";

function step(fen = initialFen) {
  return {
    ply: 3,
    moveNumber: 2,
    color: "w",
    san: "e4",
    lan: "e2e4",
    from: "e2",
    to: "e4",
    fenBefore: fen,
    fenAfter: fen,
    phase: "Khai cuộc",
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
}

function baseline() {
  return {
    depth: 13,
    evaluation: "+0.25",
    whiteScoreCp: 25,
    centipawnLoss: 0,
    moverScoreBeforeCp: 40,
    moverScoreAfterCp: 25,
    expectedPointsLoss: 0,
    quality: "best",
    bestMoveUci: "e2e4",
    bestMoveSan: "e4",
    bestLineSan: ["e4", "e5"],
    bestReplyUci: "e7e5",
    bestReplySan: "e5",
    replyLineSan: ["e5"],
    variations: [{
      rank: 1,
      evaluation: "+0.40",
      whiteScoreCp: 40,
      moveUci: "e2e4",
      moveSan: "e4",
      lineSan: ["e4", "e5"],
    }],
    playedMoveUci: "e2e4",
  };
}

test("candidate bất hợp lệ bị loại trước khi tạo vị trí phân tích", () => {
  const source = step();
  assert.equal(prepareCandidateMove(source, "e2", "e5"), null);
  assert.equal(source.fenBefore, initialFen);
});

test("candidate hợp lệ giữ nguyên mainline và tạo step độc lập", () => {
  const source = step();
  const candidate = prepareCandidateMove(source, "d2", "d4");
  assert.ok(candidate);
  assert.equal(candidate.moveUci, "d2d4");
  assert.equal(candidate.moveSan, "d4");
  assert.notEqual(candidate.step.fenAfter, source.fenAfter);
  assert.equal(source.lan, "e2e4");
});

test("nhánh candidate nối tiếp nước user và nước đáp mà không sửa mainline", () => {
  const source = step();
  const userMove = prepareCandidateMoveFromFen(
    source,
    source.fenBefore,
    "d2",
    "d4",
    undefined,
    source.ply,
  );
  assert.ok(userMove);
  const engineMove = prepareCandidateMoveFromFen(
    source,
    userMove.step.fenAfter,
    "d6",
    "d5",
    undefined,
    source.ply + 1,
  );
  assert.ok(engineMove);
  assert.equal(engineMove.step.fenBefore, userMove.step.fenAfter);
  assert.equal(engineMove.step.ply, source.ply + 1);
  assert.equal(engineMove.step.color, "b");
  assert.equal(source.fenBefore, initialFen);
  assert.equal(source.lan, "e2e4");
});

test("hoàn tất lượt candidate tự thêm nước đáp Stockfish vào nhánh tạm", () => {
  const source = step();
  const session = createCandidateSessionState(initialFen, 2, "Điểm rẽ");
  const candidate = prepareCandidateMoveFromFen(
    source,
    initialFen,
    "d2",
    "d4",
    undefined,
    3,
  );
  assert.ok(candidate);
  const userMove = { ...candidate, actor: "user" };
  const result = {
    move: candidate,
    engine: baseline(),
    evaluationBefore: "+0.40",
  };
  const completed = completeCandidateTurn(
    source,
    session,
    [],
    userMove,
    result,
  );
  assert.equal(completed.moves.length, 2);
  assert.equal(completed.moves[0].actor, "user");
  assert.equal(completed.moves[1].actor, "engine");
  assert.equal(completed.moves[1].moveUci, "e7e5");
  assert.equal(completed.moves[0].quality, "best");
  assert.equal(completed.moves[0].centipawnLoss, 0);
  assert.equal(completed.moves[1].quality, "best");
  assert.equal(completed.moves[1].centipawnLoss, 0);
  assert.equal(completed.moves[1].evaluation, "+0.25");
  assert.equal(completed.selectedIndex, 1);
  assert.equal(completed.fen, completed.moves[1].step.fenAfter);
});

test("SFX candidate nhận đúng kiểu nước từ SAN", () => {
  assert.equal(moveSfxForSan("Nf3"), "move");
  assert.equal(moveSfxForSan("Bxh7"), "capture");
  assert.equal(moveSfxForSan("Qh5+"), "check");
  assert.equal(moveSfxForSan("O-O"), "castle");
});

test("phát hiện và áp dụng phong cấp candidate", () => {
  const promotionFen = "7k/P7/8/8/8/8/8/7K w - - 0 1";
  assert.equal(candidateRequiresPromotion(promotionFen, "a7", "a8"), true);
  const candidate = prepareCandidateMove(step(promotionFen), "a7", "a8", "q");
  assert.ok(candidate);
  assert.equal(candidate.moveUci, "a7a8q");
  assert.match(candidate.moveSan, /^a8=Q/);
});

test("so sánh candidate bằng đúng depth và baseline best move", () => {
  const candidate = prepareCandidateMove(step(), "d2", "d4");
  assert.ok(candidate);
  const result = buildCandidateAnalysis(candidate, baseline(), {
    depth: 13,
    bestMove: "e7e5",
    variations: [{
      rank: 1,
      depth: 13,
      scoreType: "cp",
      scoreValue: -10,
      pv: ["e7e5", "g1f3"],
    }],
  });

  assert.equal(result.depth, 13);
  assert.equal(result.centipawnLoss, 30);
  assert.equal(result.evaluation, "+0.10");
  assert.equal(result.bestMoveSan, "e4");
  assert.equal(result.bestReplySan, "e5");
  assert.deepEqual(result.replyLineSan, ["e5", "Nf3"]);
});
