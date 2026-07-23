import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { AnalysisStep, MoveQuality } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import type { VariationState } from "../../app/types";

export type BoardMoveBadge = Exclude<MoveQuality, "good"> | "brilliant";

export const BOARD_MOVE_BADGES: Record<
  BoardMoveBadge,
  { symbol: string; label: string }
> = {
  brilliant: { symbol: "!!", label: "Brilliant" },
  best: { symbol: "★", label: "Best move" },
  inaccuracy: { symbol: "?!", label: "Thiếu chính xác" },
  mistake: { symbol: "?", label: "Sai lầm" },
  blunder: { symbol: "??", label: "Blunder" },
};

const BOARD_PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function buildVariation(
  fen: string,
  lineSan: string[],
  rank: number,
  title: string,
): VariationState | null {
  const chess = new Chess(fen);
  const positions = [chess.fen()];
  const moves: string[] = [];
  const moveSquares: Array<{ from: string; to: string }> = [];
  for (const san of lineSan) {
    try {
      const move = chess.move(san);
      if (!move) break;
      moves.push(move.san);
      moveSquares.push({ from: move.from, to: move.to });
      positions.push(chess.fen());
    } catch {
      break;
    }
  }
  return moves.length
    ? { rank, title, moves, positions, moveSquares, index: 0 }
    : null;
}

function isBrilliantMove(step: AnalysisStep, engine: EngineMoveAnalysis) {
  if (engine.quality !== "best" || engine.centipawnLoss > 10) return false;
  const before = new Chess(step.fenBefore);
  const after = new Chess(step.fenAfter);
  const movedPiece = after.get(step.to as Square);
  if (!movedPiece || BOARD_PIECE_VALUES[movedPiece.type] < 3) return false;
  const capturedPiece = before.get(step.to as Square);
  const capturedValue = capturedPiece ? BOARD_PIECE_VALUES[capturedPiece.type] : 0;
  const movedValue = BOARD_PIECE_VALUES[movedPiece.type];
  if (capturedValue >= movedValue) return false;
  const canBeCaptured = after.moves({ verbose: true }).some(
    (reply) => reply.to === step.to && reply.captured === movedPiece.type,
  );
  if (!canBeCaptured) return false;
  const moverScoreCp = engine.whiteScoreCp * (step.color === "w" ? 1 : -1);
  return moverScoreCp >= -100;
}

export function getBoardMoveBadge(
  step: AnalysisStep,
  engine?: EngineMoveAnalysis,
): BoardMoveBadge | null {
  if (!engine || engine.quality === "good") return null;
  if (isBrilliantMove(step, engine)) return "brilliant";
  return engine.quality;
}

export function getBoardBadgePosition(
  square: string,
  orientation: "white" | "black",
) {
  const fileIndex = square.charCodeAt(0) - 97;
  const rankIndex = Number(square[1]) - 1;
  const column = orientation === "white" ? fileIndex : 7 - fileIndex;
  const row = orientation === "white" ? 7 - rankIndex : rankIndex;
  return { left: `${column * 12.5}%`, top: `${row * 12.5}%` };
}
