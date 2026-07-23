import { Chess, type Color, type Square } from "chess.js";

export type LegalMoveHint = {
  square: Square;
  kind: "move" | "capture";
};

export function getLegalMoveHints(
  fen: string,
  selectedSquare: string | null,
  controlledColor: Color,
): LegalMoveHint[] {
  if (!selectedSquare) return [];

  try {
    const chess = new Chess(fen);
    const square = selectedSquare as Square;
    const piece = chess.get(square);
    if (!piece || piece.color !== controlledColor || chess.turn() !== controlledColor) {
      return [];
    }

    return chess.moves({ square, verbose: true }).map((move) => ({
      square: move.to,
      kind: move.captured ? "capture" : "move",
    }));
  } catch {
    return [];
  }
}

export function canControlPiece(
  fen: string,
  square: string | null,
  controlledColor: Color,
) {
  if (!square) return false;

  try {
    const chess = new Chess(fen);
    const piece = chess.get(square as Square);
    return chess.turn() === controlledColor && piece?.color === controlledColor;
  } catch {
    return false;
  }
}

export function toggleSquareHighlight(
  highlightedSquares: ReadonlySet<string>,
  square: string,
) {
  const next = new Set(highlightedSquares);
  if (next.has(square)) next.delete(square);
  else next.add(square);
  return next;
}
