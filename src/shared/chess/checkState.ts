import { Chess, type Square } from "chess.js";

export type BoardDropMove = {
  sourceSquare: string;
  targetSquare: string | null;
};

export function checkedKingSquare(fen: string): string | null {
  try {
    const chess = new Chess(fen);
    if (!chess.isCheck()) return null;
    const king = chess.board()
      .flat()
      .find((piece) => piece?.type === "k" && piece.color === chess.turn());
    return king?.square || null;
  } catch {
    return null;
  }
}

export function isIllegalNonKingCheckMove(
  fen: string,
  {
    sourceSquare,
    targetSquare,
  }: BoardDropMove,
) {
  if (!targetSquare) return false;
  try {
    const chess = new Chess(fen);
    if (!chess.isCheck()) return false;
    const piece = chess.get(sourceSquare as Square);
    if (!piece || piece.type === "k") return false;
    const promotion = piece.type === "p"
      && (targetSquare.endsWith("1") || targetSquare.endsWith("8"))
      ? "q"
      : undefined;
    try {
      return !chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion,
      });
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}
