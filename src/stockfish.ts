import { Chess } from "chess.js";
import type { AnalysisStep, MoveQuality } from "./analysis";
import {
  classifyExpectedPoints,
  normalizeEngineAnalysis,
  type DisplayMoveQuality,
} from "./features/analysis/moveClassification";
import type { TacticalAnalysis } from "./features/tactics/types";
import { withTacticalAnalysis } from "./features/tactics/detector.ts";
import {
  createStockfishEngine,
  emptyStockfishVariation,
  formatStockfishWhiteEvaluation,
  stockfishLineToSan,
  stockfishScoreAsCp,
  terminalStockfishSearch,
  type StockfishSearch,
} from "./shared/services/stockfishEngine";

export type EngineVariation = {
  rank: number;
  evaluation: string;
  whiteScoreCp: number;
  moveUci: string;
  moveSan: string;
  lineSan: string[];
};

export type EngineMoveAnalysis = {
  depth: number;
  evaluation: string;
  whiteScoreCp: number;
  centipawnLoss: number;
  moverScoreBeforeCp: number;
  moverScoreAfterCp: number;
  expectedPointsLoss: number;
  quality: MoveQuality;
  displayQuality?: DisplayMoveQuality;
  bestMoveUci: string;
  bestMoveSan: string;
  bestLineSan: string[];
  bestReplyUci: string;
  bestReplySan: string;
  replyLineSan: string[];
  variations: EngineVariation[];
  playedMoveUci: string;
  tactics?: TacticalAnalysis;
};

const CURRENT_MOVE_DEPTH = 13;
const FULL_GAME_DEPTH = 11;

function buildMoveAnalysis(
  fenBefore: string,
  fenAfter: string,
  playedMoveUci: string,
  before: StockfishSearch,
  after: StockfishSearch,
  playerElo = 1200,
): EngineMoveAnalysis {
  const beforeTurn = new Chess(fenBefore).turn();
  const afterTurn = new Chess(fenAfter).turn();
  const beforeTop = before.variations[0] || emptyStockfishVariation();
  const afterTop = after.variations[0] || emptyStockfishVariation();
  const beforeForMover = stockfishScoreAsCp(beforeTop);
  const afterForMover = -stockfishScoreAsCp(afterTop);
  const centipawnLoss = Math.max(0, Math.min(999, beforeForMover - afterForMover));
  const variations = before.variations.slice(0, 2).map((variation) => {
    const lineSan = stockfishLineToSan(fenBefore, variation.pv);
    const moveUci = variation.pv[0] || (variation.rank === 1 ? before.bestMove : "");
    return {
      rank: variation.rank,
      evaluation: formatStockfishWhiteEvaluation(variation, beforeTurn),
      whiteScoreCp: stockfishScoreAsCp(variation) * (beforeTurn === "w" ? 1 : -1),
      moveUci,
      moveSan: lineSan[0] || moveUci,
      lineSan,
    };
  });
  const best = variations[0] || {
    rank: 1,
    evaluation: formatStockfishWhiteEvaluation(beforeTop, beforeTurn),
    whiteScoreCp: stockfishScoreAsCp(beforeTop) * (beforeTurn === "w" ? 1 : -1),
    moveUci: before.bestMove,
    moveSan: before.bestMove,
    lineSan: [],
  };
  const bestReplyUci = afterTop.pv[0] || (after.bestMove === "(none)" ? "" : after.bestMove);
  const replyLineUci = afterTop.pv.length ? afterTop.pv : bestReplyUci ? [bestReplyUci] : [];
  const replyLineSan = stockfishLineToSan(fenAfter, replyLineUci);
  const whiteScoreCp = stockfishScoreAsCp(afterTop) * (afterTurn === "w" ? 1 : -1);
  const classification = classifyExpectedPoints(
    beforeForMover,
    afterForMover,
    playedMoveUci === best.moveUci,
    playerElo,
  );

  return {
    depth: Math.min(before.depth, after.depth),
    evaluation: formatStockfishWhiteEvaluation(afterTop, afterTurn),
    whiteScoreCp,
    centipawnLoss,
    moverScoreBeforeCp: beforeForMover,
    moverScoreAfterCp: afterForMover,
    expectedPointsLoss: classification.expectedPointsLoss,
    quality: classification.quality,
    displayQuality: classification.quality,
    bestMoveUci: best.moveUci,
    bestMoveSan: best.moveSan,
    bestLineSan: best.lineSan,
    bestReplyUci,
    bestReplySan: replyLineSan[0] || bestReplyUci,
    replyLineSan,
    variations,
    playedMoveUci,
  };
}

export async function analyzeMoveWithStockfish(
  fenBefore: string,
  fenAfter: string,
  playedMoveUci: string,
  signal?: AbortSignal,
  playerElo = 1200,
): Promise<EngineMoveAnalysis> {
  const engine = await createStockfishEngine(signal);
  try {
    const before = await engine.search(fenBefore, CURRENT_MOVE_DEPTH, 2);
    const afterPosition = new Chess(fenAfter);
    const after = afterPosition.isGameOver()
      ? terminalStockfishSearch(fenAfter, before.depth)
      : await engine.search(fenAfter, CURRENT_MOVE_DEPTH, 1);
    return buildMoveAnalysis(fenBefore, fenAfter, playedMoveUci, before, after, playerElo);
  } finally {
    engine.terminate();
  }
}

export async function analyzeGameWithStockfish(
  steps: AnalysisStep[],
  onProgress: (ply: number, result: EngineMoveAnalysis, completed: number, total: number) => void,
  signal?: AbortSignal,
  playerElos: Partial<Record<"w" | "b", number>> = {},
) {
  if (!steps.length) return;
  const engine = await createStockfishEngine(signal);
  try {
    let before = await engine.search(steps[0].fenBefore, FULL_GAME_DEPTH, 2);
    for (let index = 0; index < steps.length; index += 1) {
      if (signal?.aborted) throw new DOMException("Đã huỷ phân tích", "AbortError");
      const step = steps[index];
      const afterPosition = new Chess(step.fenAfter);
      const after = afterPosition.isGameOver()
        ? terminalStockfishSearch(step.fenAfter, before.depth)
        : await engine.search(step.fenAfter, FULL_GAME_DEPTH, 2);
      const rawResult = buildMoveAnalysis(
        step.fenBefore,
        step.fenAfter,
        step.lan,
        before,
        after,
        playerElos[step.color],
      );
      const result = withTacticalAnalysis(
        step,
        normalizeEngineAnalysis(
          step,
          rawResult,
          playerElos[step.color],
        ),
      );
      onProgress(step.ply, result, index + 1, steps.length);
      before = after;
    }
  } finally {
    engine.terminate();
  }
}
