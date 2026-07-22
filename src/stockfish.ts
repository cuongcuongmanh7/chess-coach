import { Chess } from "chess.js";
import type { MoveQuality } from "./analysis";

type RawSearch = {
  depth: number;
  scoreType: "cp" | "mate";
  scoreValue: number;
  pv: string[];
  bestMove: string;
};

export type EngineMoveAnalysis = {
  depth: number;
  evaluation: string;
  whiteScoreCp: number;
  centipawnLoss: number;
  quality: MoveQuality;
  bestMoveUci: string;
  bestMoveSan: string;
  bestLineSan: string[];
  playedMoveUci: string;
};

const ENGINE_URL = "/stockfish/stockfish-18-lite-single.js";
const SEARCH_DEPTH = 13;
const MATE_SCORE = 100_000;

function parseInfo(line: string, previous: RawSearch): RawSearch {
  if (!line.startsWith("info ") || !line.includes(" score ")) return previous;

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);
  if (!scoreMatch) return previous;

  return {
    ...previous,
    depth: depthMatch ? Number(depthMatch[1]) : previous.depth,
    scoreType: scoreMatch[1] as "cp" | "mate",
    scoreValue: Number(scoreMatch[2]),
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : previous.pv,
  };
}

function scoreAsCp(result: RawSearch) {
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

function formatWhiteEvaluation(result: RawSearch, rootColor: "w" | "b") {
  const multiplier = rootColor === "w" ? 1 : -1;
  if (result.scoreType === "mate") {
    const whiteMate = result.scoreValue * multiplier;
    return whiteMate >= 0 ? `M${Math.abs(whiteMate)}` : `−M${Math.abs(whiteMate)}`;
  }
  const whiteCp = result.scoreValue * multiplier;
  const pawns = Math.abs(whiteCp / 100).toFixed(2);
  return whiteCp >= 0 ? `+${pawns}` : `−${pawns}`;
}

function classifyLoss(centipawnLoss: number, playedMove: string, bestMove: string): MoveQuality {
  if (playedMove === bestMove || centipawnLoss <= 35) return "good";
  if (centipawnLoss <= 160) return "mistake";
  return "blunder";
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

  const search = (fen: string) =>
    new Promise<RawSearch>((resolve, reject) => {
      let result: RawSearch = {
        depth: 0,
        scoreType: "cp",
        scoreValue: 0,
        pv: [],
        bestMove: "",
      };
      const timeout = window.setTimeout(() => {
        worker.postMessage("stop");
        currentHandler = null;
        reject(new Error("Stockfish không hoàn tất phân tích."));
      }, 20_000);

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
        result.bestMove = line.split(/\s+/)[1] || result.pv[0] || "";
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        currentHandler = null;
        resolve(result);
      };

      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${SEARCH_DEPTH}`);
    });

  return { worker, search };
}

export async function analyzeMoveWithStockfish(
  fenBefore: string,
  fenAfter: string,
  playedMoveUci: string,
  signal?: AbortSignal,
): Promise<EngineMoveAnalysis> {
  const engine = await createEngine(signal);
  try {
    const afterTurn = new Chess(fenAfter).turn();
    const before = await engine.search(fenBefore);
    const afterPosition = new Chess(fenAfter);
    const after: RawSearch = afterPosition.isCheckmate()
      ? {
          depth: before.depth,
          scoreType: "mate",
          scoreValue: -1,
          pv: [],
          bestMove: "(none)",
        }
      : await engine.search(fenAfter);

    const beforeForMover = scoreAsCp(before);
    const afterForMover = -scoreAsCp(after);
    const centipawnLoss = Math.max(0, Math.min(999, beforeForMover - afterForMover));
    const bestLineSan = lineToSan(fenBefore, before.pv);
    const whiteScoreCp = scoreAsCp(after) * (afterTurn === "w" ? 1 : -1);

    return {
      depth: Math.min(before.depth, after.depth),
      evaluation: formatWhiteEvaluation(after, afterTurn),
      whiteScoreCp,
      centipawnLoss,
      quality: classifyLoss(centipawnLoss, playedMoveUci, before.bestMove),
      bestMoveUci: before.bestMove,
      bestMoveSan: bestLineSan[0] || before.bestMove,
      bestLineSan,
      playedMoveUci,
    };
  } finally {
    engine.worker.terminate();
  }
}
