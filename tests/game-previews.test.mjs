import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  finalFenFromPgn,
  hydrateGamePreviews,
  previewFromPgn,
} from "../src/features/library/gamePreviews.ts";

const PGN = `[Event "Thumbnail"]
[White "Alpha"]
[Black "Beta"]

1. e4 e5 2. Nf3 Nc6`;

test("tính đúng vị trí sau nước cuối từ PGN", () => {
  assert.equal(
    finalFenFromPgn(PGN),
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  );
  assert.equal(previewFromPgn(PGN).plyCount, 4);
});

test("backfill thumbnail và số ply trong bộ nhớ rồi tạo bản cập nhật SQLite", () => {
  const id = "a".repeat(64);
  const result = hydrateGamePreviews([{
    id,
    final_fen: null,
    ply_count: null,
    preview_pgn: PGN,
  }]);

  assert.equal(result.games[0].final_fen, finalFenFromPgn(PGN));
  assert.equal(result.games[0].ply_count, 4);
  assert.equal(result.games[0].preview_pgn, null);
  assert.deepEqual(result.updates, [{
    id,
    final_fen: finalFenFromPgn(PGN),
    ply_count: 4,
  }]);
});

test("backfill số ply khi thumbnail cũ đã có sẵn", () => {
  const id = "c".repeat(64);
  const finalFen = finalFenFromPgn(PGN);
  const result = hydrateGamePreviews([{
    id,
    final_fen: finalFen,
    ply_count: null,
    preview_pgn: PGN,
  }]);

  assert.equal(result.games[0].ply_count, 4);
  assert.deepEqual(result.updates, [{
    id,
    final_fen: finalFen,
    ply_count: 4,
  }]);
});

test("bỏ qua PGN cũ bị lỗi mà không làm hỏng danh sách", () => {
  const game = {
    id: "b".repeat(64),
    final_fen: null,
    ply_count: null,
    preview_pgn: "invalid",
  };
  const result = hydrateGamePreviews([game]);

  assert.equal(result.games[0], game);
  assert.deepEqual(result.updates, []);
});

test("thumbnail dùng track pixel nguyên để không sinh đường seam", () => {
  const css = readFileSync(
    new URL("../src/features/library/library.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /width:\s*50px/);
  assert.match(css, /height:\s*50px/);
  assert.match(css, /grid-template-columns:\s*repeat\(8,6px\)/);
  assert.match(css, /grid-template-rows:\s*repeat\(8,6px\)/);
  assert.match(css, /\.game-position-thumbnail i\s*\{[^}]*overflow:\s*hidden/s);
});
