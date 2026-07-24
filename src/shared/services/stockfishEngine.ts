import { Chess } from "chess.js";

type ScoreType = "cp" | "mate";

export type StockfishVariation = {
  rank: number;
  depth: number;
  scoreType: ScoreType;
  scoreValue: number;
  pv: string[];
};

export type StockfishSearch = {
  depth: number;
  bestMove: string;
  variations: StockfishVariation[];
};

export type StockfishEngine = {
  search: (fen: string, depth: number, multiPv: number) => Promise<StockfishSearch>;
  terminate: () => void;
};

const ENGINE_URL = "/stockfish/stockfish-18-lite-single.js";
const MATE_SCORE = 100_000;

export function emptyStockfishVariation(rank = 1): StockfishVariation {
  return { rank, depth: 0, scoreType: "cp", scoreValue: 0, pv: [] };
}

function parseInfo(line: string, previous: StockfishSearch): StockfishSearch {
  if (!line.startsWith("info ") || !line.includes(" score ")) return previous;

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);
  if (!scoreMatch) return previous;

  const rank = multipvMatch ? Number(multipvMatch[1]) : 1;
  const existing = previous.variations.find((item) => item.rank === rank)
    || emptyStockfishVariation(rank);
  const variation: StockfishVariation = {
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

export function stockfishScoreAsCp(result: StockfishVariation) {
  if (result.scoreType === "cp") return result.scoreValue;
  const direction = result.scoreValue >= 0 ? 1 : -1;
  return direction * (MATE_SCORE - Math.min(Math.abs(result.scoreValue), 99) * 100);
}

export function stockfishLineToSan(fen: string, line: string[]) {
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

export function formatStockfishWhiteEvaluation(
  result: StockfishVariation,
  rootColor: "w" | "b",
) {
  const multiplier = rootColor === "w" ? 1 : -1;
  if (result.scoreType === "mate") {
    const whiteMate = result.scoreValue * multiplier;
    return whiteMate >= 0 ? `M${Math.abs(whiteMate)}` : `−M${Math.abs(whiteMate)}`;
  }
  const whiteCp = result.scoreValue * multiplier;
  const pawns = Math.abs(whiteCp / 100).toFixed(2);
  return whiteCp >= 0 ? `+${pawns}` : `−${pawns}`;
}

export function terminalStockfishSearch(fen: string, depth: number): StockfishSearch {
  const position = new Chess(fen);
  const variation = emptyStockfishVariation();
  variation.depth = depth;
  if (position.isCheckmate()) {
    variation.scoreType = "mate";
    variation.scoreValue = -1;
  }
  return { depth, bestMove: "(none)", variations: [variation] };
}

export async function createStockfishEngine(signal?: AbortSignal): Promise<StockfishEngine> {
  if (signal?.aborted) throw new DOMException("Đã huỷ phân tích", "AbortError");

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
    new Promise<StockfishSearch>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Đã huỷ phân tích", "AbortError"));
        return;
      }
      let result: StockfishSearch = { depth: 0, bestMove: "", variations: [] };
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

  return {
    search,
    terminate: () => worker.terminate(),
  };
}
