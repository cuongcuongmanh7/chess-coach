import type { Color, PieceSymbol } from "chess.js";

/** Giá trị quân cờ tiêu chuẩn (vua = 0). */
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/** Glyph Unicode cho từng màu/loại quân. */
export const PIECE_GLYPHS: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};
