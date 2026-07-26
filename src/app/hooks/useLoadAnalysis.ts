import { useCallback } from "react";
import { analyzePgn, type GameAnalysis } from "../../analysis";
import type { AppState } from "./useAppState";

type HydrateEngineCache = (
  gameId: string,
  analysis: GameAnalysis,
) => Promise<void>;

export function useLoadAnalysis(
  state: AppState,
  hydrateEngineCache: HydrateEngineCache,
) {
  const {
    autoAttemptsRef,
    cacheLookupsRef,
    cacheMissesRef,
    fullAnalysisAbortRef,
    setAiCache,
    setAnalysis,
    setCurrentGameId,
    setCurrentIndex,
    setEngineCache,
    setError,
    setFullAnalysis,
    setGameCoachError,
    setGameCoachLoading,
    setGameCoachSummary,
    setImportOpen,
    setInput,
    setLibraryOpen,
    setPromotionPending,
    setRetryState,
    setSummaryOpen,
    setVariationPlaying,
    setVariationState,
    setWorkspaceMode,
  } = state;

  return useCallback((pgn: string, gameId: string | null = null) => {
    const next = analyzePgn(pgn);
    fullAnalysisAbortRef.current?.abort();
    fullAnalysisAbortRef.current = null;
    setAnalysis(next);
    setWorkspaceMode("analysis");
    setCurrentGameId(gameId);
    setCurrentIndex(0);
    setEngineCache({});
    setAiCache({});
    setGameCoachSummary(null);
    setGameCoachError("");
    setGameCoachLoading(false);
    setRetryState(null);
    setPromotionPending(null);
    setVariationState(null);
    setVariationPlaying(false);
    setSummaryOpen(false);
    setLibraryOpen(false);
    setFullAnalysis({
      running: false,
      complete: false,
      completed: 0,
      total: next.steps.length,
      error: "",
    });
    cacheLookupsRef.current.clear();
    cacheMissesRef.current.clear();
    autoAttemptsRef.current.clear();
    setImportOpen(false);
    setInput("");
    setError("");
    if (gameId) void hydrateEngineCache(gameId, next);
    return next;
  }, [
    autoAttemptsRef,
    cacheLookupsRef,
    cacheMissesRef,
    fullAnalysisAbortRef,
    hydrateEngineCache,
    setAiCache,
    setAnalysis,
    setCurrentGameId,
    setCurrentIndex,
    setEngineCache,
    setError,
    setFullAnalysis,
    setGameCoachError,
    setGameCoachLoading,
    setGameCoachSummary,
    setImportOpen,
    setInput,
    setLibraryOpen,
    setPromotionPending,
    setRetryState,
    setSummaryOpen,
    setVariationPlaying,
    setVariationState,
    setWorkspaceMode,
  ]);
}
