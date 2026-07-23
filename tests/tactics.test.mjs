import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { detectTactics } from "../src/features/tactics/detector.ts";

function moveFromUci(position, uci) {
  return position.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || undefined,
  });
}

function fixture({
  fen,
  played,
  best,
  bestLine,
  reply = "",
  replyLine,
  loss = 180,
}) {
  const playedPosition = new Chess(fen);
  const playedMove = moveFromUci(playedPosition, played);
  assert.ok(playedMove, `played move ${played} phải hợp lệ`);
  const bestPosition = new Chess(fen);
  const bestMove = moveFromUci(bestPosition, best);
  assert.ok(bestMove, `best move ${best} phải hợp lệ`);
  const replyPosition = new Chess(playedPosition.fen());
  const replyMove = reply ? moveFromUci(replyPosition, reply) : null;
  if (reply) assert.ok(replyMove, `reply ${reply} phải hợp lệ`);
  const step = {
    ply: 1,
    moveNumber: 1,
    color: playedMove.color,
    san: playedMove.san,
    lan: playedMove.lan,
    from: playedMove.from,
    to: playedMove.to,
    fenBefore: fen,
    fenAfter: playedPosition.fen(),
    phase: "Trung cuộc",
    quality: loss >= 100 ? "blunder" : "good",
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
  return {
    step,
    engine: {
      depth: 13,
      evaluation: "−1.80",
      whiteScoreCp: -180,
      centipawnLoss: loss,
      moverScoreBeforeCp: 0,
      moverScoreAfterCp: -loss,
      expectedPointsLoss: 0.2,
      quality: loss >= 100 ? "blunder" : "good",
      bestMoveUci: best,
      bestMoveSan: bestMove.san,
      bestLineSan: bestLine || [bestMove.san],
      bestReplyUci: reply,
      bestReplySan: replyMove?.san || "",
      replyLineSan: replyLine || (replyMove ? [replyMove.san] : []),
      variations: [],
      playedMoveUci: played,
    },
  };
}

function motifs(input) {
  const { step, engine } = fixture(input);
  return detectTactics(step, engine).tags.map((tag) => tag.motif);
}

const cases = [
  {
    motif: "check-mate-threat",
    input: {
      fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
      played: "f7f6",
      best: "f7g7",
      bestLine: ["Qg7#"],
    },
  },
  {
    motif: "missed-capture",
    input: {
      fen: "6k1/8/8/8/3q4/8/3R4/6K1 w - - 0 1",
      played: "g1h1",
      best: "d2d4",
      bestLine: ["Rxd4"],
    },
  },
  {
    motif: "hanging-piece",
    input: {
      fen: "6k1/8/8/8/3r4/8/3Q4/6K1 w - - 0 1",
      played: "d2d3",
      best: "d2a2",
      reply: "d4d3",
    },
  },
  {
    motif: "fork",
    input: {
      fen: "3q3k/8/7N/8/8/8/8/6K1 w - - 0 1",
      played: "h6g4",
      best: "h6f7",
      bestLine: ["Nf7+"],
    },
  },
  {
    motif: "absolute-pin",
    input: {
      fen: "8/3k4/2n5/8/B7/8/8/6K1 w - - 0 1",
      played: "a4c2",
      best: "a4b5",
    },
  },
  {
    motif: "skewer",
    input: {
      fen: "3q4/8/3k4/8/8/8/8/R5K1 w - - 0 1",
      played: "a1a2",
      best: "a1d1",
      bestLine: ["Rd1+"],
    },
  },
  {
    motif: "discovered-attack",
    input: {
      fen: "q5k1/8/8/8/8/N7/8/R5K1 w - - 0 1",
      played: "a3c4",
      best: "a3b5",
    },
  },
  {
    motif: "back-rank",
    input: {
      fen: "r5k1/8/8/8/8/8/5PPP/6K1 w - - 0 1",
      played: "f2f3",
      best: "f2f4",
      reply: "a8a1",
    },
  },
  {
    motif: "passed-pawn",
    input: {
      fen: "6k1/8/4P3/8/8/8/8/6K1 w - - 0 1",
      played: "e6e7",
      best: "e6e7",
      loss: 0,
    },
  },
  {
    motif: "removal-of-defender",
    input: {
      fen: "6k1/4r3/2n5/1B6/8/8/4Q3/6K1 w - - 0 1",
      played: "b5a4",
      best: "b5c6",
      bestLine: ["Bxc6", "Kh8", "Qxe7"],
    },
  },
];

for (const { motif, input } of cases) {
  test(`nhận diện ${motif} từ FEN cố định`, () => {
    assert.ok(motifs(input).includes(motif));
  });
}

test("không báo missed capture khi dùng hậu bắt tốt không có bù đắp", () => {
  const result = motifs({
    fen: "6k1/8/8/8/3p4/8/3Q4/6K1 w - - 0 1",
    played: "d2a2",
    best: "d2d4",
  });
  assert.equal(result.includes("missed-capture"), false);
});

test("không báo fork nếu evaluation không cho thấy lợi ích", () => {
  const result = motifs({
    fen: "3q3k/8/7N/8/8/8/8/6K1 w - - 0 1",
    played: "h6g4",
    best: "h6f7",
    bestLine: ["Nf7+"],
    loss: 0,
  });
  assert.equal(result.includes("fork"), false);
});
