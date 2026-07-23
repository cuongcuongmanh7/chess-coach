import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { AnalysisStep, MoveQuality } from "../../analysis";

export type DisplayMoveQuality = MoveQuality | "brilliant";

type ClassificationVariation = {
  rank: number;
  evaluation: string;
  whiteScoreCp?: number;
};

export type ClassificationEngineData = {
  whiteScoreCp: number;
  centipawnLoss: number;
  quality: MoveQuality;
  playedMoveUci: string;
  bestMoveUci: string;
  bestReplyUci: string;
  variations: ClassificationVariation[];
  moverScoreBeforeCp?: number;
  moverScoreAfterCp?: number;
  expectedPointsLoss?: number;
  displayQuality?: DisplayMoveQuality;
};

const DEFAULT_ELO = 1200;
const MATE_SCORE_CP = 100_000;
const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function normalizePlayerElo(value?: string | number | null) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.max(400, Math.min(3000, parsed)) : DEFAULT_ELO;
}

export function playerEloForColor(
  headers: Record<string, string>,
  color: "w" | "b",
) {
  return normalizePlayerElo(color === "w" ? headers.WhiteElo : headers.BlackElo);
}

function expectedPointsScale(elo: number) {
  return Math.max(92, Math.min(168, 168 - (normalizePlayerElo(elo) - 400) * 0.045));
}

export function expectedPointsFromCp(scoreCp: number, elo = DEFAULT_ELO) {
  if (scoreCp >= 90_000) return 1;
  if (scoreCp <= -90_000) return 0;
  return 1 / (1 + Math.exp(-scoreCp / expectedPointsScale(elo)));
}

export function classifyExpectedPoints(
  beforeMoverCp: number,
  afterMoverCp: number,
  playedBestMove: boolean,
  elo = DEFAULT_ELO,
): { quality: MoveQuality; expectedPointsLoss: number } {
  const expectedPointsLoss = Math.max(
    0,
    expectedPointsFromCp(beforeMoverCp, elo) - expectedPointsFromCp(afterMoverCp, elo),
  );
  if (playedBestMove || expectedPointsLoss <= 0.005) {
    return { quality: "best", expectedPointsLoss };
  }
  if (expectedPointsLoss <= 0.05) return { quality: "good", expectedPointsLoss };
  if (expectedPointsLoss <= 0.10) return { quality: "inaccuracy", expectedPointsLoss };
  if (expectedPointsLoss <= 0.20) return { quality: "mistake", expectedPointsLoss };
  return { quality: "blunder", expectedPointsLoss };
}

function evaluationToWhiteCp(evaluation: string) {
  const normalized = evaluation.replace("−", "-").trim();
  if (normalized.includes("M")) return normalized.startsWith("-") ? -MATE_SCORE_CP : MATE_SCORE_CP;
  const pawns = Number.parseFloat(normalized);
  return Number.isFinite(pawns) ? Math.round(pawns * 100) : 0;
}

function moverScores(step: AnalysisStep, engine: ClassificationEngineData) {
  const multiplier = step.color === "w" ? 1 : -1;
  const after = engine.moverScoreAfterCp
    ?? engine.whiteScoreCp * multiplier;
  const before = engine.moverScoreBeforeCp
    ?? after + engine.centipawnLoss;
  return { before, after, multiplier };
}

function bestReplyCapturesOfferedPiece(
  step: AnalysisStep,
  bestReplyUci: string,
) {
  if (!bestReplyUci || bestReplyUci.length < 4) return false;
  try {
    const position = new Chess(step.fenAfter);
    const reply = position.move({
      from: bestReplyUci.slice(0, 2),
      to: bestReplyUci.slice(2, 4),
      promotion: bestReplyUci[4] || undefined,
    });
    return Boolean(reply?.captured && reply.to === step.to);
  } catch {
    return false;
  }
}

export function isBrilliantMove(
  step: AnalysisStep,
  engine: ClassificationEngineData,
  elo = DEFAULT_ELO,
) {
  const playerElo = normalizePlayerElo(elo);
  const tolerance = playerElo < 1200 ? 0.03 : playerElo < 1800 ? 0.02 : 0.012;
  if (
    !["best", "good"].includes(engine.quality)
    || (engine.expectedPointsLoss ?? 1) > tolerance
  ) {
    return false;
  }

  const beforePosition = new Chess(step.fenBefore);
  const afterPosition = new Chess(step.fenAfter);
  const destination = step.to as Square;
  const movedPiece = afterPosition.get(destination);
  if (!movedPiece || PIECE_VALUES[movedPiece.type] < 3) return false;
  const capturedPiece = beforePosition.get(destination);
  const investment = PIECE_VALUES[movedPiece.type]
    - (capturedPiece ? PIECE_VALUES[capturedPiece.type] : 0);
  const minimumInvestment = playerElo < 1200 ? 1 : playerElo < 1800 ? 2 : 3;
  if (investment < minimumInvestment) return false;

  const offeredCapture = afterPosition.moves({ verbose: true }).some(
    (reply) => reply.to === step.to && reply.captured === movedPiece.type,
  );
  if (!offeredCapture) return false;
  if (
    playerElo >= 1800
    && !bestReplyCapturesOfferedPiece(step, engine.bestReplyUci)
  ) {
    return false;
  }

  const scores = moverScores(step, engine);
  const beforeExpected = expectedPointsFromCp(scores.before, playerElo);
  const afterExpected = expectedPointsFromCp(scores.after, playerElo);
  const badPositionFloor = playerElo < 1200 ? 0.32 : playerElo < 1800 ? 0.37 : 0.42;
  const completelyWinningCeiling = playerElo < 1200 ? 0.97 : playerElo < 1800 ? 0.94 : 0.91;
  if (afterExpected < badPositionFloor || beforeExpected > completelyWinningCeiling) {
    return false;
  }

  if (step.phase === "Tàn cuộc") {
    const second = engine.variations.find((variation) => variation.rank === 2);
    if (!second) return false;
    const secondWhiteCp = second.whiteScoreCp ?? evaluationToWhiteCp(second.evaluation);
    const secondMoverExpected = expectedPointsFromCp(
      secondWhiteCp * scores.multiplier,
      playerElo,
    );
    const uniquenessGap = beforeExpected - secondMoverExpected;
    const minimumGap = playerElo < 1200 ? 0.015 : playerElo < 1800 ? 0.025 : 0.04;
    if (uniquenessGap < minimumGap) return false;
  }

  return true;
}

export function normalizeEngineAnalysis<T extends ClassificationEngineData>(
  step: AnalysisStep,
  engine: T,
  elo = DEFAULT_ELO,
): T & {
  moverScoreBeforeCp: number;
  moverScoreAfterCp: number;
  expectedPointsLoss: number;
  displayQuality: DisplayMoveQuality;
} {
  const scores = moverScores(step, engine);
  const classification = classifyExpectedPoints(
    scores.before,
    scores.after,
    engine.playedMoveUci === engine.bestMoveUci,
    elo,
  );
  const normalized = {
    ...engine,
    moverScoreBeforeCp: scores.before,
    moverScoreAfterCp: scores.after,
    expectedPointsLoss: classification.expectedPointsLoss,
    quality: classification.quality,
    variations: engine.variations.map((variation) => ({
      ...variation,
      whiteScoreCp: variation.whiteScoreCp ?? evaluationToWhiteCp(variation.evaluation),
    })),
  };
  return {
    ...normalized,
    displayQuality: isBrilliantMove(step, normalized, elo)
      ? "brilliant"
      : classification.quality,
  };
}
