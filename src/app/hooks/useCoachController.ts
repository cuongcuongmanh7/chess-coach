import { useCallback, useEffect, useMemo } from "react";
import type { AnalysisStep, GameAnalysis } from "../../analysis";
import { analyzeGameWithStockfish, type EngineMoveAnalysis } from "../../stockfish";
import { DEFAULT_MODELS } from "../constants";
import { analysisRepository } from "../../features/analysis/services/analysisRepository";
import { playerEloForColor } from "../../features/analysis/moveClassification";
import type { DisplayMoveQuality } from "../../features/analysis/moveClassification";
import { coachRepository } from "../../features/coach/services/coachRepository";
import { markSyncedPreferencesChanged } from "../../features/cloud/services/cloudPreferences";
import { isTauri } from "../../shared/services/tauriClient";
import type { AiProvider } from "../../shared/types/tauri";
import type { useCloudController } from "./useCloudController";
import type { useDataController } from "./useDataController";
import type { AppState } from "./useAppState";
import type { useTrainingController } from "../../features/training/hooks/useTrainingController";

type CloudController = ReturnType<typeof useCloudController>;
type DataController = ReturnType<typeof useDataController>;
type TrainingController = ReturnType<typeof useTrainingController>;

type CoachDependencies = {
  step: AnalysisStep;
  engine: EngineMoveAnalysis | undefined;
  headers: GameAnalysis["headers"];
  quality: DisplayMoveQuality;
  aiCacheKey: string;
  hasApiKey: boolean;
  providerLabel: string;
  gameSummaryRequest: DataController["gameSummaryRequest"];
  persistEngineResult: DataController["persistEngineResult"];
  refreshSavedGames: CloudController["refreshSavedGames"];
  syncCloud: CloudController["syncCloud"];
  generateCardsForGame: TrainingController["generateCardsForGame"];
};
export function useCoachController(
  state: AppState,
  {
    step,
    engine,
    headers,
    quality,
    aiCacheKey,
    hasApiKey,
    providerLabel,
    gameSummaryRequest,
    persistEngineResult,
    refreshSavedGames,
    syncCloud,
    generateCardsForGame,
  }: CoachDependencies,
) {
  const {
    analysis,
    firebaseUser,
    setSettingsOpen,
    currentGameId,
    error,
    setEngineCache,
    setSummaryOpen,
    fullAnalysis,
    setFullAnalysis,
    setGameCoachSummary,
    gameCoachLoading,
    setGameCoachLoading,
    setGameCoachError,
    aiCache,
    setAiCache,
    aiLoading,
    setAiLoading,
    setAiError,
    setHasApiKeys,
    apiKeyInput,
    setApiKeyInput,
    setSettingsError,
    provider,
    setProvider,
    model,
    setModel,
    autoExplainMode,
    aiInFlightRef,
    cacheLookupsRef,
    cacheMissesRef,
    autoAttemptsRef,
    fullAnalysisAbortRef,
  } = state;
  const startFullGameAnalysis = async () => {
    if (fullAnalysis.running) return;
    if (fullAnalysis.complete) {
      setSummaryOpen(true);
      return;
    }

    const controller = new AbortController();
    fullAnalysisAbortRef.current?.abort();
    fullAnalysisAbortRef.current = controller;
    setFullAnalysis({ running: true, complete: false, completed: 0, total: analysis.steps.length, error: "" });
    const persistenceTasks: Promise<void>[] = [];
    const completedEngineCache: Record<number, EngineMoveAnalysis> = {};

    try {
      await analyzeGameWithStockfish(
        analysis.steps,
        (ply, result, completed, total) => {
          completedEngineCache[ply] = result;
          setEngineCache((cache) => {
            if ((cache[ply]?.depth || 0) >= result.depth) return cache;
            return { ...cache, [ply]: result };
          });
          const analyzedStep = analysis.steps[ply - 1];
          if (currentGameId && analyzedStep) {
            persistenceTasks.push(persistEngineResult(currentGameId, analyzedStep, result));
          }
          setFullAnalysis({ running: true, complete: false, completed, total, error: "" });
        },
        controller.signal,
        {
          w: playerEloForColor(headers, "w"),
          b: playerEloForColor(headers, "b"),
        },
      );
      if (!controller.signal.aborted) {
        if (persistenceTasks.length) await Promise.allSettled(persistenceTasks);
        if (currentGameId && isTauri()) {
          await analysisRepository.markComplete(currentGameId);
          await generateCardsForGame(
            currentGameId,
            analysis.steps,
            completedEngineCache,
          ).catch(() => ({ created: 0, eligible: 0 }));
          void refreshSavedGames();
          if (firebaseUser) void syncCloud(firebaseUser, false);
        }
        setFullAnalysis({ running: false, complete: true, completed: analysis.steps.length, total: analysis.steps.length, error: "" });
        setSummaryOpen(true);
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setFullAnalysis((value) => ({
        ...value,
        running: false,
        error: reason instanceof Error ? reason.message : String(reason),
      }));
    } finally {
      if (fullAnalysisAbortRef.current === controller) fullAnalysisAbortRef.current = null;
    }
  };

  const saveApiSettings = async () => {
    setSettingsError("");
    try {
      if (!isTauri()) throw new Error("Cấu hình API cần mở app Tauri.");
      if (apiKeyInput.trim()) {
        await coachRepository.setApiKey(provider, apiKeyInput.trim());
        setHasApiKeys((values) => ({ ...values, [provider]: true }));
        setApiKeyInput("");
      } else if (!hasApiKey) {
        throw new Error(`Hãy nhập ${providerLabel} API key.`);
      }
      localStorage.setItem("kypho-ai-provider", provider);
      localStorage.setItem(`kypho-ai-model-${provider}`, model);
      localStorage.setItem("kypho-ai-auto-mode", autoExplainMode);
      markSyncedPreferencesChanged();
      setSettingsOpen(false);
      if (firebaseUser) void syncCloud(firebaseUser, false);
    } catch (reason) {
      setSettingsError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const clearApiKey = async () => {
    if (!isTauri()) return;
    await coachRepository.clearApiKey(provider);
    const available = await coachRepository.hasApiKey(provider);
    setHasApiKeys((values) => ({ ...values, [provider]: available }));
    setApiKeyInput("");
  };

  const clearSavedExplanations = async () => {
    if (!isTauri()) return;
    await coachRepository.clearCache();
    setAiCache({});
    setGameCoachSummary(null);
    setGameCoachError("");
    cacheLookupsRef.current.clear();
    cacheMissesRef.current.clear();
    autoAttemptsRef.current.clear();
    if (firebaseUser) void syncCloud(firebaseUser, false);
  };

  const changeProvider = (nextProvider: AiProvider) => {
    setProvider(nextProvider);
    setModel(localStorage.getItem(`kypho-ai-model-${nextProvider}`) || DEFAULT_MODELS[nextProvider]);
    setApiKeyInput("");
    setSettingsError("");
    setGameCoachSummary(null);
    setGameCoachError("");
  };

  const changeModel = (nextModel: string) => {
    setModel(nextModel);
    setGameCoachSummary(null);
    setGameCoachError("");
  };

  const aiRequest = useMemo(() => {
    if (!engine) return null;
    const playerElo = step.color === "w" ? headers.WhiteElo : headers.BlackElo;
    return {
      player_elo: playerElo || null,
      side_just_moved: step.color === "w" ? "Trắng" : "Đen",
      side_to_move: step.color === "w" ? "Đen" : "Trắng",
      phase: step.phase,
      move_number: step.moveNumber,
      played_move: step.san,
      fen_before: step.fenBefore,
      fen_after: step.fenAfter,
      evaluation: engine.evaluation,
      centipawn_loss: Math.round(engine.centipawnLoss),
      best_move: engine.bestMoveSan,
      best_line: engine.bestLineSan,
      best_reply: engine.bestReplySan || null,
      reply_line: engine.replyLineSan,
    };
  }, [engine, headers.BlackElo, headers.WhiteElo, step]);

  const explainWithAi = useCallback(async (forceRefresh = false) => {
    if (!engine || !aiRequest || aiInFlightRef.current) return;
    if (!hasApiKey) {
      setSettingsOpen(true);
      return;
    }
    aiInFlightRef.current = true;
    setAiLoading(true);
    setAiError("");
    try {
      const response = await coachRepository.explain(
        provider,
        model,
        aiRequest,
        forceRefresh,
      );
      setAiCache((cache) => ({ ...cache, [aiCacheKey]: response }));
      cacheMissesRef.current.delete(aiCacheKey);
      if (!response.cached && firebaseUser) void syncCloud(firebaseUser, false);
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      aiInFlightRef.current = false;
      setAiLoading(false);
    }
  }, [aiCacheKey, aiRequest, engine, firebaseUser, hasApiKey, model, provider, syncCloud]);

  const summarizeGameWithAi = useCallback(async (forceRefresh = false) => {
    if (!gameSummaryRequest || gameCoachLoading) return;
    if (!hasApiKey) {
      setSummaryOpen(false);
      setSettingsOpen(true);
      return;
    }
    setGameCoachLoading(true);
    setGameCoachError("");
    try {
      const response = await coachRepository.summarize(
        provider,
        model,
        gameSummaryRequest,
        forceRefresh,
      );
      setGameCoachSummary(response);
      if (!response.cached && firebaseUser) void syncCloud(firebaseUser, false);
    } catch (reason) {
      setGameCoachError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setGameCoachLoading(false);
    }
  }, [firebaseUser, gameCoachLoading, gameSummaryRequest, hasApiKey, model, provider, syncCloud]);

  useEffect(() => {
    if (!isTauri() || !engine || !aiRequest || aiCache[aiCacheKey]) return;
    const shouldAutoExplain = autoExplainMode === "visited" || (autoExplainMode === "mistakes" && (quality === "mistake" || quality === "blunder"));
    const triggerAutoExplanation = () => {
      if (!shouldAutoExplain || !hasApiKey || aiInFlightRef.current || autoAttemptsRef.current.has(aiCacheKey)) return;
      autoAttemptsRef.current.add(aiCacheKey);
      void explainWithAi(false);
    };

    if (cacheMissesRef.current.has(aiCacheKey)) {
      triggerAutoExplanation();
      return;
    }
    if (cacheLookupsRef.current.has(aiCacheKey)) return;
    cacheLookupsRef.current.add(aiCacheKey);

    coachRepository.cached(provider, model, aiRequest)
      .then((saved) => {
        if (saved) {
          setAiCache((cache) => ({ ...cache, [aiCacheKey]: saved }));
          return;
        }
        cacheMissesRef.current.add(aiCacheKey);
        triggerAutoExplanation();
      })
      .catch((reason) => setAiError(reason instanceof Error ? reason.message : String(reason)));
  }, [aiCache, aiCacheKey, aiLoading, aiRequest, autoExplainMode, engine, explainWithAi, hasApiKey, model, provider, quality]);
  return {
    startFullGameAnalysis,
    saveApiSettings,
    clearApiKey,
    clearSavedExplanations,
    changeProvider,
    changeModel,
    aiRequest,
    explainWithAi,
    summarizeGameWithAi,
  };
}
