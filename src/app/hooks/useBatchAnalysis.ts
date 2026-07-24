import { analyzePgn, type AnalysisStep } from "../../analysis";
import { analyzeGameWithStockfish, type EngineMoveAnalysis } from "../../stockfish";
import { playerEloForColor } from "../../features/analysis/moveClassification";
import { analysisRepository } from "../../features/analysis/services/analysisRepository";
import { gameRepository } from "../../features/library/services/gameRepository";
import { selectBatchCandidates, type BatchScope } from "../../features/analysis/batchQueue";
import { isTauri } from "../../shared/services/tauriClient";
import type { User as FirebaseUser } from "../../firebase";
import type { SavedGameSummary } from "../../shared/types/tauri";
import type { AppState } from "./useAppState";

export type { BatchScope };

type BatchDeps = {
  persistEngineResult: (gameId: string, step: AnalysisStep, result: EngineMoveAnalysis) => Promise<void>;
  generateCardsForGame: (
    gameId: string,
    steps: AnalysisStep[],
    cache: Record<number, EngineMoveAnalysis>,
  ) => Promise<unknown>;
  refreshSavedGames: () => void | Promise<unknown>;
  syncCloud: (user: FirebaseUser, force: boolean) => void | Promise<unknown>;
};

export function useBatchAnalysis(state: AppState, deps: BatchDeps) {
  const candidates = (timeClass: string, scope: BatchScope): SavedGameSummary[] =>
    selectBatchCandidates(state.savedGames, timeClass, scope);

  const countBatchCandidates = (timeClass: string) => candidates(timeClass, "all").length;

  const waitWhilePaused = async (signal: AbortSignal) => {
    while (state.batchPausedRef.current && !signal.aborted) {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
  };

  const analyzeOneGame = async (game: SavedGameSummary, signal: AbortSignal) => {
    const detail = await gameRepository.open(game.id);
    const parsed = analyzePgn(detail.pgn);
    const cache: Record<number, EngineMoveAnalysis> = {};
    const persistTasks: Promise<void>[] = [];
    await analyzeGameWithStockfish(
      parsed.steps,
      (ply, result, completed, total) => {
        cache[ply] = result;
        const analyzedStep = parsed.steps[ply - 1];
        if (analyzedStep) persistTasks.push(deps.persistEngineResult(game.id, analyzedStep, result));
        state.setBatchAnalysis((cur) => ({ ...cur, currentPly: completed, currentPlyTotal: total }));
      },
      signal,
      { w: playerEloForColor(parsed.headers, "w"), b: playerEloForColor(parsed.headers, "b") },
    );
    if (signal.aborted) return;
    if (persistTasks.length) await Promise.allSettled(persistTasks);
    await analysisRepository.markComplete(game.id);
    await deps.generateCardsForGame(game.id, parsed.steps, cache).catch(() => undefined);
  };

  const startBatchAnalysis = async (scope: BatchScope, timeClass: string) => {
    if (!isTauri()) return;
    if (state.batchAnalysis.running || state.fullAnalysis.running) return;
    const pool = candidates(timeClass, scope);
    state.setBatchSheetOpen(false);
    if (!pool.length) {
      state.setBatchAnalysis((cur) => ({ ...cur, finished: true, total: 0, done: 0, failed: 0 }));
      return;
    }

    const controller = new AbortController();
    state.batchAnalysisAbortRef.current?.abort();
    state.batchAnalysisAbortRef.current = controller;
    state.batchPausedRef.current = false;
    state.setBatchAnalysis({
      running: true, paused: false, finished: false, total: pool.length,
      done: 0, failed: 0, currentGameId: null, currentLabel: "", currentPly: 0, currentPlyTotal: 0,
    });

    let done = 0;
    let failed = 0;
    try {
      for (const game of pool) {
        if (controller.signal.aborted) break;
        await waitWhilePaused(controller.signal);
        if (controller.signal.aborted) break;
        state.setBatchAnalysis((cur) => ({
          ...cur,
          currentGameId: game.id,
          currentLabel: `${game.white || "Trắng"} – ${game.black || "Đen"}`,
          currentPly: 0,
          currentPlyTotal: game.ply_count || 0,
        }));
        try {
          await analyzeOneGame(game, controller.signal);
          if (controller.signal.aborted) break;
          done += 1;
        } catch (reason) {
          if (reason instanceof DOMException && reason.name === "AbortError") break;
          failed += 1;
        }
        state.setBatchAnalysis((cur) => ({ ...cur, done, failed }));
      }
    } finally {
      if (state.batchAnalysisAbortRef.current === controller) state.batchAnalysisAbortRef.current = null;
      state.batchPausedRef.current = false;
      void deps.refreshSavedGames();
      if (state.firebaseUser) void deps.syncCloud(state.firebaseUser, false);
      state.setBatchAnalysis((cur) => ({
        ...cur,
        running: false,
        paused: false,
        finished: true,
        currentGameId: null,
        currentPly: 0,
        currentPlyTotal: 0,
      }));
    }
  };

  const pauseBatchAnalysis = () => {
    state.batchPausedRef.current = true;
    state.setBatchAnalysis((cur) => ({ ...cur, paused: true }));
  };
  const resumeBatchAnalysis = () => {
    state.batchPausedRef.current = false;
    state.setBatchAnalysis((cur) => ({ ...cur, paused: false }));
  };
  const cancelBatchAnalysis = () => {
    state.batchAnalysisAbortRef.current?.abort();
    state.batchPausedRef.current = false;
  };
  const dismissBatchResult = () => state.setBatchAnalysis((cur) => ({ ...cur, finished: false }));

  return {
    countBatchCandidates,
    startBatchAnalysis,
    pauseBatchAnalysis,
    resumeBatchAnalysis,
    cancelBatchAnalysis,
    dismissBatchResult,
  };
}
