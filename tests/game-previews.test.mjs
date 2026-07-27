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
  // Neo đầu dòng để không bắt vào rule dẫn xuất
  // (`.library-thumbnail-status .game-position-thumbnail`).
  const block = css.match(/^\.game-position-thumbnail\s*\{([^}]*)\}/m)?.[1];
  assert.ok(block, "không tìm thấy rule .game-position-thumbnail");

  const pixels = (pattern) => {
    const value = block.match(pattern)?.[1];
    assert.ok(value, `thiếu khai báo khớp ${pattern}`);
    return Number(value);
  };
  const columns = pixels(/grid-template-columns:\s*repeat\(8,\s*(\d+(?:\.\d+)?)px\)/);
  const rows = pixels(/grid-template-rows:\s*repeat\(8,\s*(\d+(?:\.\d+)?)px\)/);
  const width = pixels(/\bwidth:\s*(\d+(?:\.\d+)?)px/);
  const height = pixels(/\bheight:\s*(\d+(?:\.\d+)?)px/);
  const border = pixels(/border:\s*(\d+(?:\.\d+)?)px/);

  // Track phải là số pixel NGUYÊN: track lẻ làm trình duyệt làm tròn từng ô
  // khác nhau và sinh đường seam giữa các ô bàn cờ.
  assert.ok(Number.isInteger(columns), `track cột ${columns}px không phải số nguyên`);
  assert.ok(Number.isInteger(rows), `track hàng ${rows}px không phải số nguyên`);
  assert.equal(columns, rows, "bàn cờ thumbnail phải vuông");

  // box-sizing: border-box nên khung ngoài = 8 track + hai viền, không được lệch.
  assert.match(block, /box-sizing:\s*border-box/);
  assert.equal(width, columns * 8 + border * 2, "chiều rộng lệch khỏi 8 track + viền");
  assert.equal(height, rows * 8 + border * 2, "chiều cao lệch khỏi 8 track + viền");

  // Ô con phải đúng kích thước track, nếu không nội dung sẽ tràn qua ô kế bên.
  const cell = css.match(/^\.game-position-thumbnail i\s*\{([^}]*)\}/m)?.[1];
  assert.ok(cell, "không tìm thấy rule ô thumbnail");
  assert.match(cell, new RegExp(`\\bwidth:\\s*${columns}px`));
  assert.match(cell, new RegExp(`\\bheight:\\s*${rows}px`));
  assert.match(cell, /overflow:\s*hidden/);
});
