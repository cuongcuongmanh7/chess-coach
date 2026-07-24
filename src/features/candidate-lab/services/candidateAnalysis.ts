import { Chess } from "chess.js";
import {
  classifyExpectedPoints,
  normalizeEngineAnalysis,
} from "../../analysis/moveClassification.ts";
import { withTacticalAnalysis } from "../../tactics/detector.ts";
import type { EngineMoveAnalysis } from "../../../stockfish";
import {
  createStockfishEngine,
  emptyStockfishVariation,
  formatStockfishWhiteEvaluation,
  stockfishLineToSan,
  stockfishScoreAsCp,
  terminalStockfishSearch,
  type StockfishSearch,
} from "../../../shared/services/stockfishEngine.ts";
import type { CandidateMove, CandidateResult } from "../types";

export type CandidateBranchAnalyzer = {
  analyze: (
    candidate: CandidateMove,
    depth: number,
    playerElo?: number,
  ) => Promise<CandidateResult>;
  terminate: () => void;
};

function buildCandidateBaseline(
  fen: string,
  before: StockfishSearch,
): EngineMoveAnalysis {
  const turn = new Chess(fen).turn();
  const top = before.variations[0] || emptyStockfishVariation();
  const variations = before.variations.slice(0, 2).map((variation) => {
    const lineSan = stockfishLineToSan(fen, variation.pv);
    const moveUci = variation.pv[0]
      || (variation.rank === 1 ? before.bestMove : "");
    return {
      rank: variation.rank,
      evaluation: formatStockfishWhiteEvaluation(variation, turn),
      whiteScoreCp: stockfishScoreAsCp(variation) * (turn === "w" ? 1 : -1),
      moveUci,
      moveSan: lineSan[0] || moveUci,
      lineSan,
    };
  });
  const best = variations[0];
  const moverScore = stockfishScoreAsCp(top);
  return {
    depth: before.depth,
    evaluation: best?.evaluation || "0.00",
    whiteScoreCp: best?.whiteScoreCp || 0,
    centipawnLoss: 0,
    moverScoreBeforeCp: moverScore,
    moverScoreAfterCp: moverScore,
    expectedPointsLoss: 0,
    quality: "best",
    displayQuality: "best",
    bestMoveUci: best?.moveUci || before.bestMove,
    bestMoveSan: best?.moveSan || before.bestMove,
    bestLineSan: best?.lineSan || [],
    bestReplyUci: "",
    bestReplySan: "",
    replyLineSan: [],
    variations,
    playedMoveUci: "",
  };
}

export function buildCandidateAnalysis(
  candidate: CandidateMove,
  baseline: EngineMoveAnalysis,
  after: StockfishSearch,
  playerElo = 1200,
): EngineMoveAnalysis {
  const afterTurn = new Chess(candidate.step.fenAfter).turn();
  const afterTop = after.variations[0] || emptyStockfishVariation();
  const afterForMover = -stockfishScoreAsCp(afterTop);
  const centipawnLoss = Math.max(
    0,
    Math.min(999, baseline.moverScoreBeforeCp - afterForMover),
  );
  const bestReplyUci = afterTop.pv[0]
    || (after.bestMove === "(none)" ? "" : after.bestMove);
  const replyLineUci = afterTop.pv.length
    ? afterTop.pv
    : bestReplyUci ? [bestReplyUci] : [];
  const replyLineSan = stockfishLineToSan(candidate.step.fenAfter, replyLineUci);
  const classification = classifyExpectedPoints(
    baseline.moverScoreBeforeCp,
    afterForMover,
    candidate.moveUci === baseline.bestMoveUci,
    playerElo,
  );

  return {
    depth: Math.min(baseline.depth, after.depth),
    evaluation: formatStockfishWhiteEvaluation(afterTop, afterTurn),
    whiteScoreCp: stockfishScoreAsCp(afterTop) * (afterTurn === "w" ? 1 : -1),
    centipawnLoss,
    moverScoreBeforeCp: baseline.moverScoreBeforeCp,
    moverScoreAfterCp: afterForMover,
    expectedPointsLoss: classification.expectedPointsLoss,
    quality: classification.quality,
    displayQuality: classification.quality,
    bestMoveUci: baseline.bestMoveUci,
    bestMoveSan: baseline.bestMoveSan,
    bestLineSan: baseline.bestLineSan,
    bestReplyUci,
    bestReplySan: replyLineSan[0] || bestReplyUci,
    replyLineSan,
    variations: baseline.variations,
    playedMoveUci: candidate.moveUci,
  };
}

export async function analyzeCandidateMove(
  candidate: CandidateMove,
  baseline: EngineMoveAnalysis,
  signal?: AbortSignal,
  playerElo = 1200,
): Promise<CandidateResult> {
  const engine = await createStockfishEngine(signal);
  try {
    const position = new Chess(candidate.step.fenAfter);
    const after = position.isGameOver()
      ? terminalStockfishSearch(candidate.step.fenAfter, baseline.depth)
      : await engine.search(candidate.step.fenAfter, baseline.depth, 1);
    const raw = buildCandidateAnalysis(candidate, baseline, after, playerElo);
    const normalized = normalizeEngineAnalysis(candidate.step, raw, playerElo);
    return {
      move: candidate,
      engine: withTacticalAnalysis(candidate.step, normalized),
      evaluationBefore: baseline.variations[0]?.evaluation || "0.00",
    };
  } finally {
    engine.terminate();
  }
}

export async function createCandidateBranchAnalyzer(
  signal?: AbortSignal,
): Promise<CandidateBranchAnalyzer> {
  const engine = await createStockfishEngine(signal);
  return {
    analyze: async (candidate, depth, playerElo = 1200) => {
      const before = await engine.search(candidate.step.fenBefore, depth, 2);
      const afterPosition = new Chess(candidate.step.fenAfter);
      const after = afterPosition.isGameOver()
        ? terminalStockfishSearch(candidate.step.fenAfter, before.depth)
        : await engine.search(candidate.step.fenAfter, depth, 1);
      const baseline = buildCandidateBaseline(candidate.step.fenBefore, before);
      const raw = buildCandidateAnalysis(
        candidate,
        baseline,
        after,
        playerElo,
      );
      const normalized = normalizeEngineAnalysis(candidate.step, raw, playerElo);
      return {
        move: candidate,
        engine: withTacticalAnalysis(candidate.step, normalized),
        evaluationBefore: baseline.variations[0]?.evaluation || "0.00",
      };
    },
    terminate: () => engine.terminate(),
  };
}
