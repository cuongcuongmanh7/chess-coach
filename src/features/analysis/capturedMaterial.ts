import { Chess, type Color, type PieceSymbol } from "chess.js";
import { PIECE_VALUES } from "../../shared/chess/pieces";

export type CapturedMaterial = {
  /** Quân (màu đen) mà Trắng đã ăn. */
  whiteCaptured: PieceSymbol[];
  /** Quân (màu trắng) mà Đen đã ăn. */
  blackCaptured: PieceSymbol[];
  /** Chênh lệch vật chất: dương = Trắng lợi, âm = Đen lợi. */
  diff: number;
};

// Thứ tự hiển thị: giá trị cao trước.
const DISPLAY_ORDER: PieceSymbol[] = ["q", "r", "b", "n", "p"];

function countByColor(chess: Chess): Record<Color, Partial<Record<PieceSymbol, number>>> {
  const counts: Record<Color, Partial<Record<PieceSymbol, number>>> = { w: {}, b: {} };
  for (const piece of chess.board().flat()) {
    if (!piece) continue;
    counts[piece.color][piece.type] = (counts[piece.color][piece.type] || 0) + 1;
  }
  return counts;
}

function colorValue(counts: Partial<Record<PieceSymbol, number>>): number {
  return (Object.keys(counts) as PieceSymbol[]).reduce(
    (sum, type) => sum + PIECE_VALUES[type] * (counts[type] || 0),
    0,
  );
}

/**
 * So sánh thế cờ bắt đầu (startFen) với thế cờ hiện tại (currentFen) để suy ra
 * quân đã bị ăn của mỗi bên và chênh lệch vật chất. Dùng startFen thật của ván
 * nên đúng cả khi ván bắt đầu từ thế cờ tùy biến ([FEN]).
 */
export function computeCapturedMaterial(
  startFen: string | undefined,
  currentFen: string | undefined,
): CapturedMaterial | null {
  if (!startFen || !currentFen) return null;
  let start: ReturnType<typeof countByColor>;
  let current: ReturnType<typeof countByColor>;
  try {
    start = countByColor(new Chess(startFen));
    current = countByColor(new Chess(currentFen));
  } catch {
    return null;
  }

  const missing = (color: Color): PieceSymbol[] => {
    const list: PieceSymbol[] = [];
    for (const type of DISPLAY_ORDER) {
      const gone = (start[color][type] || 0) - (current[color][type] || 0);
      for (let i = 0; i < gone; i++) list.push(type);
    }
    return list;
  };

  return {
    whiteCaptured: missing("b"), // quân đen thiếu = Trắng ăn
    blackCaptured: missing("w"), // quân trắng thiếu = Đen ăn
    diff: colorValue(current.w) - colorValue(current.b),
  };
}
