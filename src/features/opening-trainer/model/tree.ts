import { Chess } from "chess.js";
import type { RepertoireColor, RepertoireNode } from "../types";

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function epd(fen: string) {
  return fen.split(" ").slice(0, 4).join(" ");
}

export function applyUci(fen: string, uci: string): { fen: string; san: string } | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    if (!move) return null;
    return { fen: chess.fen(), san: move.san };
  } catch {
    return null;
  }
}

export function childrenOf(tree: RepertoireNode[], parentId: string | null) {
  return tree.filter((node) => node.parent_id === parentId);
}

export function turnColor(fen: string): RepertoireColor {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

// Node cha có fen của nó = thế TRƯỚC nước đó; thế SAU = fen của con.
// Thế hiện tại của một tập con (anh em) = fen (fenBefore) của bất kỳ con nào.
export function positionFen(
  tree: RepertoireNode[],
  parentId: string | null,
  fallback: string,
): string {
  const kids = childrenOf(tree, parentId);
  return kids[0]?.fen ?? fallback;
}
