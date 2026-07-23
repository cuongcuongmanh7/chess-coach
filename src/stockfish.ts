import { Chess } from "chess.js";
import type { AnalysisStep, MoveQuality } from "./analysis";
import {
  classifyExpectedPoints,
  normalizeEngineAnalysis,
  type DisplayMoveQuality,
} from "./features/analysis/moveClassification";
import type { TacticalAnalysis } from "./features/tactics/types";
import { withTacticalAnalysis } from "./features/tactics/detector.ts";

type ScoreType = "cp" | "mate";

type RawVariation = {
  rank: number;
  depth: number;
  scoreType: ScoreType;
  scoreValue: number;
  pv: string[];
};

type RawSearch = {
  depth: number;
  bestMove: string;
  variations: RawVariation[];
};

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

const ENGINE_URL = "/stockfish/stockfish-18-lite-single.js";
const CURRENT_MOVE_DEPTH = 13;
const FULL_GAME_DEPTH = 11;
const MATE_SCORE = 100_000;

function emptyVariation(rank = 1): RawVariation {
  return { rank, depth: 0, scoreType: "cp", scoreValue: 0, pv: [] };
}

function parseInfo(line: string, previous: RawSearch): RawSearch {
  if (!line.startsWith("info ") || !line.includes(" score ")) return previous;

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);
  if (!scoreMatch) return previous;

  const rank = multipvMatch ? Number(multipvMatch[1]) : 1;
  const existing = previous.variations.find((item) => item.rank === rank) || emptyVariation(rank);
  const variation: RawVariation = {
    rank,
    depth: depthMatch ? Number(depthMatch[1]) : existing.depth,
    scoreType: scoreMatch[1] as ScoreType,
    scoreValue: Number(scoreMatch[2]),
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : existing.pv,
  };
  const variations = previous.variations.filter((item) => item.rank !== rank);
  variations.push(variation);
  variations.sort((left, right) => left.rank - right.rank);

  return {
    ...previous,
    depth: Math.max(previous.depth, variation.depth),
    variations,
  };
}

function scoreAsCp(result: RawVariation) {
  if (result.scoreType === "cp") return result.scoreValue;
  const direction = result.scoreValue >= 0 ? 1 : -1;
  return direction * (MATE_SCORE - Math.min(Math.abs(result.scoreValue), 99) * 100);
}

function lineToSan(fen: string, line: string[]) {
  const chess = new Chess(fen);
  const san: string[] = [];

  for (const uci of line.slice(0, 6)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || undefined,
      });
      if (!move) break;
      san.push(move.san);
    } catch {
      break;
    }
  }
  return san;
}

function formatWhiteEvaluation(result: RawVariation, rootColor: "w" | "b") {
  const multiplier = rootColor === "w" ? 1 : -1;
  if (result.scoreType === "mate") {
    const whiteMate = result.scoreValue * multiplier;
    return whiteMate >= 0 ? `M${Math.abs(whiteMate)}` : `−M${Math.abs(whiteMate)}`;
  }
  const whiteCp = result.scoreValue * multiplier;
  const pawns = Math.abs(whiteCp / 100).toFixed(2);
  return whiteCp >= 0 ? `+${pawns}` : `−${pawns}`;
}

function terminalSearch(fen: string, depth: number): RawSearch {
  const position = new Chess(fen);
  const variation = emptyVariation();
  variation.depth = depth;
  if (position.isCheckmate()) {
    variation.scoreType = "mate";
    variation.scoreValue = -1;
  }
  return { depth, bestMove: "(none)", variations: [variation] };
}

async function createEngine(signal?: AbortSignal) {
  const worker = new Worker(ENGINE_URL);
  let currentHandler: ((line: string) => void) | null = null;
  worker.onmessage = (event) => currentHandler?.(String(event.data));

  const waitFor = (command: string, expected: string, timeoutMs = 12_000) =>
    new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        currentHandler = null;
        reject(new Error("Stockfish phản hồi quá chậm."));
      }, timeoutMs);
      const abort = () => {
        window.clearTimeout(timeout);
        currentHandler = null;
        reject(new DOMException("Đã huỷ phân tích", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      currentHandler = (line) => {
        if (!line.includes(expected)) return;
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        currentHandler = null;
        resolve();
      };
      worker.postMessage(command);
    });

  try {
    await waitFor("uci", "uciok");
    await waitFor("isready", "readyok");
  } catch (error) {
    worker.terminate();
    throw error;
  }

  const search = (fen: string, depth: number, multiPv: number) =>
    new Promise<RawSearch>((resolve, reject) => {
      let result: RawSearch = { depth: 0, bestMove: "", variations: [] };
      const timeout = window.setTimeout(() => {
        worker.postMessage("stop");
        currentHandler = null;
        reject(new Error("Stockfish không hoàn tất phân tích."));
      }, 30_000);
      const abort = () => {
        worker.postMessage("stop");
        window.clearTimeout(timeout);
        currentHandler = null;
        reject(new DOMException("Đã huỷ phân tích", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      currentHandler = (line) => {
        result = parseInfo(line, result);
        if (!line.startsWith("bestmove ")) return;
        result.bestMove = line.split(/\s+/)[1] || result.variations[0]?.pv[0] || "";
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        currentHandler = null;
        resolve(result);
      };

      worker.postMessage(`setoption name MultiPV value ${multiPv}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });

  return { worker, search };
}

function buildMoveAnalysis(
  fenBefore: string,
  fenAfter: string,
  playedMoveUci: string,
  before: RawSearch,
  after: RawSearch,
  playerElo = 1200,
): EngineMoveAnalysis {
  const beforeTurn = new Chess(fenBefore).turn();
  const afterTurn = new Chess(fenAfter).turn();
  const beforeTop = before.variations[0] || emptyVariation();
  const afterTop = after.variations[0] || emptyVariation();
  const beforeForMover = scoreAsCp(beforeTop);
  const afterForMover = -scoreAsCp(afterTop);
  const centipawnLoss = Math.max(0, Math.min(999, beforeForMover - afterForMover));
  const variations = before.variations.slice(0, 2).map((variation) => {
    const lineSan = lineToSan(fenBefore, variation.pv);
    const moveUci = variation.pv[0] || (variation.rank === 1 ? before.bestMove : "");
    return {
      rank: variation.rank,
      evaluation: formatWhiteEvaluation(variation, beforeTurn),
      whiteScoreCp: scoreAsCp(variation) * (beforeTurn === "w" ? 1 : -1),
      moveUci,
      moveSan: lineSan[0] || moveUci,
      lineSan,
    };
  });
  const best = variations[0] || {
    rank: 1,
    evaluation: formatWhiteEvaluation(beforeTop, beforeTurn),
    whiteScoreCp: scoreAsCp(beforeTop) * (beforeTurn === "w" ? 1 : -1),
    moveUci: before.bestMove,
    moveSan: before.bestMove,
    lineSan: [],
  };
  const bestReplyUci = afterTop.pv[0] || (after.bestMove === "(none)" ? "" : after.bestMove);
  const replyLineUci = afterTop.pv.length ? afterTop.pv : bestReplyUci ? [bestReplyUci] : [];
  const replyLineSan = lineToSan(fenAfter, replyLineUci);
  const whiteScoreCp = scoreAsCp(afterTop) * (afterTurn === "w" ? 1 : -1);
  const classification = classifyExpectedPoints(
    beforeForMover,
    afterForMover,
    playedMoveUci === best.moveUci,
    playerElo,
  );

  return {
    depth: Math.min(before.depth, after.depth),
    evaluation: formatWhiteEvaluation(afterTop, afterTurn),
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
  const engine = await createEngine(signal);
  try {
    const before = await engine.search(fenBefore, CURRENT_MOVE_DEPTH, 2);
    const afterPosition = new Chess(fenAfter);
    const after = afterPosition.isGameOver()
      ? terminalSearch(fenAfter, before.depth)
      : await engine.search(fenAfter, CURRENT_MOVE_DEPTH, 1);
    return buildMoveAnalysis(fenBefore, fenAfter, playedMoveUci, before, after, playerElo);
  } finally {
    engine.worker.terminate();
  }
}

export async function analyzeGameWithStockfish(
  steps: AnalysisStep[],
  onProgress: (ply: number, result: EngineMoveAnalysis, completed: number, total: number) => void,
  signal?: AbortSignal,
  playerElos: Partial<Record<"w" | "b", number>> = {},
) {
  if (!steps.length) return;
  const engine = await createEngine(signal);
  try {
    let before = await engine.search(steps[0].fenBefore, FULL_GAME_DEPTH, 2);
    for (let index = 0; index < steps.length; index += 1) {
      if (signal?.aborted) throw new DOMException("Đã huỷ phân tích", "AbortError");
      const step = steps[index];
      const afterPosition = new Chess(step.fenAfter);
      const after = afterPosition.isGameOver()
        ? terminalSearch(step.fenAfter, before.depth)
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
    engine.worker.terminate();
  }
}
