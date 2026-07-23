import { Chess } from "chess.js";
import type { AnalysisStep } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import type { VariationState } from "../../app/types";
import type { DisplayMoveQuality } from "./moveClassification";

export type BoardMoveBadge = Exclude<DisplayMoveQuality, "good">;

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

export function getBoardMoveBadge(
  _step: AnalysisStep,
  engine?: EngineMoveAnalysis,
): BoardMoveBadge | null {
  const quality = engine?.displayQuality || engine?.quality;
  if (!quality || quality === "good") return null;
  return quality;
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
