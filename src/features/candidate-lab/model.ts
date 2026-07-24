import { Chess, type Square } from "chess.js";
import type { AnalysisStep } from "../../analysis";
import type { CandidateMove } from "./types";

export function candidateRequiresPromotion(
  fen: string,
  from: string,
  to: string,
) {
  try {
    const position = new Chess(fen);
    const piece = position.get(from as Square);
    return piece?.type === "p" && (to.endsWith("8") || to.endsWith("1"));
  } catch {
    return false;
  }
}

export function prepareCandidateMove(
  source: AnalysisStep,
  from: string,
  to: string,
  promotion?: string,
): CandidateMove | null {
  return prepareCandidateMoveFromFen(
    source,
    source.fenBefore,
    from,
    to,
    promotion,
    source.ply,
  );
}

export function prepareCandidateMoveFromFen(
  source: AnalysisStep,
  fenBefore: string,
  from: string,
  to: string,
  promotion?: string,
  ply = source.ply,
): CandidateMove | null {
  const position = new Chess(fenBefore);
  try {
    const move = position.move({
      from,
      to,
      promotion: promotion || undefined,
    });
    if (!move) return null;
    return {
      moveUci: move.lan,
      moveSan: move.san,
      step: {
        ...source,
        ply,
        moveNumber: Number(fenBefore.split(/\s+/)[5]) || source.moveNumber,
        color: move.color,
        san: move.san,
        lan: move.lan,
        from: move.from,
        to: move.to,
        fenBefore,
        fenAfter: position.fen(),
        title: "",
        comment: "",
        insight: "",
        tags: [],
        arrows: [{
          startSquare: move.from,
          endSquare: move.to,
          color: "#b58cff",
        }],
      },
    };
  } catch {
    return null;
  }
}
