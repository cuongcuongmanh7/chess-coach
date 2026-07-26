import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { buildRepertoire } from "../src/features/opening-trainer/model/buildRepertoire.ts";

function stepsFromSans(sans) {
  const chess = new Chess();
  return sans.map((san, index) => {
    const before = chess.fen();
    const move = chess.move(san);
    return {
      ply: index + 1,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color,
      san: move.san,
      lan: move.lan,
      from: move.from,
      to: move.to,
      fenBefore: before,
      fenAfter: chess.fen(),
      phase: "Khai cuộc",
      quality: "best",
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
  });
}

function game(sans, engineByPly) {
  return { steps: stepsFromSans(sans), playerColor: "w", engineByPly };
}

test("gộp cây theo tần suất và nối cha đúng cho biến trắng", () => {
  const games = [game(["e4", "e5", "Nf3"]), game(["e4", "e5", "Nf3"])];
  const result = buildRepertoire(games, "w", { minFrequency: 2 });

  const byUci = new Map(result.nodes.map((node) => [node.move_uci, node]));
  const e4 = byUci.get("e2e4");
  const e5 = byUci.get("e7e5");
  const nf3 = byUci.get("g1f3");
  assert.ok(e4 && e5 && nf3, "phải giữ cả ba node");
  assert.equal(e4.frequency, 2);
  assert.equal(e4.is_user_move, true);
  assert.equal(e5.is_user_move, false);
  assert.equal(e4.parent_key, null);
  assert.equal(e5.parent_key, e4.node_key);
  assert.equal(nf3.parent_key, e5.node_key);
});

test("đặt tên/ECO từ biến chính qua resolver tiêm vào", () => {
  const games = [game(["e4", "e5", "Nf3"]), game(["e4", "e5", "Nf3"])];
  // Resolver stub: nhận diện thế sau 2.Nf3.
  const resolve = (fen) =>
    fen.startsWith("r1bqkbnr/pppp1ppp/2n5")
      ? { eco: "C40", name: "King's Knight Opening" }
      : fen.split(" ").slice(0, 4).join(" ") ===
          "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -"
        ? { eco: "C40", name: "King's Knight Opening" }
        : null;
  const result = buildRepertoire(games, "w", { minFrequency: 2 }, resolve);
  assert.equal(result.name, "King's Knight Opening");
  assert.equal(result.eco, "C40");
});

test("không có resolver thì dùng tên mặc định theo màu", () => {
  const games = [game(["e4", "e5", "Nf3"]), game(["e4", "e5", "Nf3"])];
  const result = buildRepertoire(games, "w", { minFrequency: 2 });
  assert.equal(result.name, "Repertoire Trắng");
  assert.equal(result.eco, null);
});

test("thêm node Stockfish khi nước người dùng có CPL cao", () => {
  // Trắng đi f3 (kém) hai lần; Stockfish gợi ý e4.
  const engine = { 1: { centipawnLoss: 120, bestMoveUci: "e2e4", bestMoveSan: "e4" } };
  const games = [game(["f3", "e5"], engine), game(["f3", "e5"], engine)];
  const result = buildRepertoire(games, "w", { minFrequency: 2, highCplThreshold: 80 });
  const stockfish = result.nodes.find((node) => node.source === "stockfish");
  assert.ok(stockfish, "phải có node Stockfish gợi ý");
  assert.equal(stockfish.move_uci, "e2e4");
  assert.equal(stockfish.is_user_move, true);
  assert.equal(stockfish.frequency, 0);
});

test("một vị trí có nhiều nước hợp lệ giữ thành node anh em", () => {
  const games = [
    game(["e4", "e5"]),
    game(["e4", "e5"]),
    game(["d4", "d5"]),
    game(["d4", "d5"]),
  ];
  const result = buildRepertoire(games, "w", { minFrequency: 2 });
  const rootUserMoves = result.nodes.filter(
    (node) => node.parent_key === null && node.is_user_move,
  );
  assert.equal(rootUserMoves.length, 2);
});
