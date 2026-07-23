import type { AnalysisStep } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import type { DisplayMoveQuality } from "./moveClassification";

export type PlayerMoveStats = Record<DisplayMoveQuality, number>;

export const PLAYER_MOVE_QUALITY_ORDER: DisplayMoveQuality[] = [
  "brilliant",
  "best",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
];

export function playerColorForUsername(
  headers: Record<string, string>,
  username?: string | null,
): "w" | "b" | null {
  const normalized = username?.trim().toLocaleLowerCase();
  if (!normalized) return null;
  if (headers.White?.trim().toLocaleLowerCase() === normalized) return "w";
  if (headers.Black?.trim().toLocaleLowerCase() === normalized) return "b";
  return null;
}

export function buildPlayerMoveStats(
  steps: AnalysisStep[],
  engineCache: Record<number, EngineMoveAnalysis>,
  color: "w" | "b",
): PlayerMoveStats {
  const counts: PlayerMoveStats = {
    brilliant: 0,
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
  steps.forEach((step) => {
    if (step.color !== color) return;
    const result = engineCache[step.ply];
    if (!result) return;
    counts[result.displayQuality || result.quality] += 1;
  });
  return counts;
}
