import { useCallback, useMemo } from "react";
import { buildDashboardStats } from "../../dashboard";
import { openingTimeline } from "../../openings";
import { playSfx, setSfxEnabled as persistSfxEnabled } from "../../sfx";
import { firebaseConfigured } from "../../firebase";
import {
  GEMINI_MODELS,
  OPENAI_MODELS,
  PROVIDER_LABELS,
} from "../constants";
import {
  getBoardBadgePosition,
  getBoardMoveBadge,
} from "../../features/analysis/boardUtils";
import { openingFromHeaders } from "../../features/library/utils";
import { evaluationToWhitePercent } from "../../shared/utils/format";
import { useAppState } from "./useAppState";
import { useCloudController } from "./useCloudController";
import { useDataController } from "./useDataController";
import { useAppEffects } from "./useAppEffects";
import { useLibraryController } from "./useLibraryController";
import { useCoachController } from "./useCoachController";
import { useBoardController } from "./useBoardController";
import { useTrainingController } from "../../features/training/hooks/useTrainingController";
import { useTacticsController } from "../../features/tactics/hooks/useTacticsController";
import {
  buildPlayerMoveStats,
  playerColorForUsername,
} from "../../features/analysis/playerMoveStats";
import { useCandidateLabComposition } from "./useCandidateLabComposition";

export function useAppController() {
  const appState = useAppState();
  const {
    analysis, setAnalysis, currentIndex, setCurrentIndex, orientation, setOrientation,
    importOpen, setImportOpen, libraryOpen, setLibraryOpen, sidebarCollapsed, setSidebarCollapsed,
    dashboardOpen, setDashboardOpen, profilesOpen, setProfilesOpen, settingsOpen, setSettingsOpen,
    sfxEnabled, setSfxEnabled, accountOpen, setAccountOpen, firebaseUser, setFirebaseUser,
    authLoading, setAuthLoading, cloudSyncing, setCloudSyncing, lastCloudSyncAt, setLastCloudSyncAt,
    currentGameId, setCurrentGameId, input, setInput, error, setError, loading, setLoading,
    savedGames, setSavedGames, libraryLoading, setLibraryLoading, libraryError, setLibraryError,
    dashboardRecords, setDashboardRecords, dashboardLoading, setDashboardLoading,
    dashboardError, setDashboardError, profiles, setProfiles, profilesLoading, setProfilesLoading,
    profilesError, setProfilesError, activeProfileId, setActiveProfileId,
    newProfilePlatform, setNewProfilePlatform, newProfileUsername, setNewProfileUsername,
    importMode, setImportMode, syncTimeClass, setSyncTimeClass, syncStatus, setSyncStatus,
    syncNotice, setSyncNotice, syncProgress, setSyncProgress, engineCache, setEngineCache,
    engineLoading, setEngineLoading, engineError, setEngineError, retryState, setRetryState,
    promotionPending, setPromotionPending, variationState, setVariationState,
    variationPlaying, setVariationPlaying, summaryOpen, setSummaryOpen, fullAnalysis,
    setFullAnalysis, gameCoachSummary, setGameCoachSummary, gameCoachLoading,
    setGameCoachLoading, gameCoachError, setGameCoachError, aiCache, setAiCache,
    aiLoading, setAiLoading, aiError, setAiError, hasApiKeys, setHasApiKeys,
    apiKeyInput, setApiKeyInput, settingsError, setSettingsError, provider, setProvider,
    model, setModel, autoExplainMode, setAutoExplainMode, aiInFlightRef, cacheLookupsRef,
    cacheMissesRef, autoAttemptsRef, fullAnalysisAbortRef, timelineScrollerRef,
    coachScrollerRef, cloudSyncInFlightRef, cloudSyncPendingRef, cloudRetryTimerRef,
    cloudRetryAttemptRef, cloudRetryHandlerRef, cloudSyncedUserRef,
    activeProfileStorageKeyRef, previousMoveIndexRef, modalWasOpenRef, analysisWasCompleteRef,
  } = appState;

  const step = analysis.steps[currentIndex];
  const engine = engineCache[step.ply];
  const aiCacheKey = `${provider}:${model}:${step.fenAfter}`;
  const aiExplanation = aiCache[aiCacheKey];
  const quality = engine?.displayQuality || engine?.quality || step.quality;
  const headers = analysis.headers;
  const openingsByPly = useMemo(() => openingTimeline(analysis.steps), [analysis.steps]);
  const currentOpening = openingsByPly[currentIndex] || openingFromHeaders(headers);
  const gameOpening = openingsByPly[openingsByPly.length - 1] || openingFromHeaders(headers);
  const totalMoves = Math.ceil(analysis.steps.length / 2);
  const hasApiKey = hasApiKeys[provider];
  const providerLabel = PROVIDER_LABELS[provider];
  const models = provider === "gemini" ? GEMINI_MODELS : OPENAI_MODELS;
  const whiteEvaluationPercent = evaluationToWhitePercent(engine?.whiteScoreCp);
  const evaluationLeader: "white" | "black" =
    (engine?.whiteScoreCp || 0) >= 0 ? "white" : "black";
  const evaluationScoreAtTop = evaluationLeader !== orientation;
  const boardMoveBadge = getBoardMoveBadge(step, engine);
  const boardMoveBadgePosition = getBoardBadgePosition(step.to, orientation);
  const dashboardStats = useMemo(() => buildDashboardStats(dashboardRecords), [dashboardRecords]);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || null;
  const playerMoveSummary = useMemo(() => {
    if (!fullAnalysis.complete || !activeProfile) return null;
    const color = playerColorForUsername(headers, activeProfile.username);
    if (!color) return null;
    return {
      playerName: color === "w" ? headers.White || activeProfile.username : headers.Black || activeProfile.username,
      stats: buildPlayerMoveStats(analysis.steps, engineCache, color),
    };
  }, [activeProfile, analysis.steps, engineCache, fullAnalysis.complete, headers]);
  const activeProfileLabel = activeProfile
    ? `${activeProfile.platform === "chesscom" ? "Chess.com" : "Lichess"} · ${activeProfile.username}`
    : "Chưa chọn hồ sơ";
  const accountInitial = (firebaseUser?.displayName || firebaseUser?.email || "G").trim().charAt(0).toUpperCase();
  const cloudAccountLabel = firebaseUser
    ? firebaseUser.displayName || firebaseUser.email || "Google"
    : firebaseConfigured ? "Đăng nhập" : "Cloud chưa cấu hình";
  const candidateController = useCandidateLabComposition(appState, { step, engine });
  const {
    candidateState,
    candidateCanMove,
    candidateCanStartFromMainline,
    candidateControlledColor,
    boardPosition,
    boardInteractionMode,
    variationMoveSquares,
    exitCandidateLab,
    handleCandidateDrop,
  } = candidateController;
  const accountSwitchBusy = cloudSyncing
    || loading
    || libraryLoading
    || profilesLoading
    || fullAnalysis.running
    || engineLoading
    || candidateState.loading
    || aiLoading
    || gameCoachLoading;

  const movePairs = useMemo(() => {
    const pairs: Array<{ number: number; white?: number; black?: number }> = [];
    analysis.steps.forEach((item, index) => {
      const pairIndex = item.moveNumber - 1;
      if (!pairs[pairIndex]) pairs[pairIndex] = { number: item.moveNumber };
      if (item.color === "w") pairs[pairIndex].white = index;
      else pairs[pairIndex].black = index;
    });
    return pairs;
  }, [analysis]);

  const cloudController = useCloudController(appState, accountSwitchBusy);
  const {
    refreshProfiles,
    refreshSavedGames,
    syncCloud,
  } = cloudController;
  const syncTrainingProgress = useCallback(() => {
    if (firebaseUser) void syncCloud(firebaseUser, false);
  }, [firebaseUser, syncCloud]);
  const trainingController = useTrainingController(activeProfileId, syncTrainingProgress);
  const toggleSfx = () => {
    const next = !sfxEnabled;
    if (!next) playSfx("tap");
    persistSfxEnabled(next);
    setSfxEnabled(next);
    if (next) playSfx("success");
  };

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("kypho-sidebar-collapsed", String(next));
    playSfx("tap");
  };

  const dataController = useDataController(appState, {
    syncCloud,
    refreshProfiles,
    refreshSavedGames,
    gameOpening,
    headers,
    generateCardsForGame: trainingController.generateCardsForGame,
  });
  const {
    persistEngineResult,
    hydrateEngineCache,
    gameSummaryRequest,
  } = dataController;
  useAppEffects(appState, {
    step,
    engine,
    syncCloud,
    refreshProfiles,
    refreshSavedGames,
    persistEngineResult,
    candidateActive: candidateState.active,
  });
  const libraryController = useLibraryController(appState, {
    activeProfile,
    syncCloud,
    refreshProfiles,
    refreshSavedGames,
    hydrateEngineCache,
  });
  const coachController = useCoachController(appState, {
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
    generateCardsForGame: trainingController.generateCardsForGame,
    fullAnalysisBlocked: candidateState.loading,
  });
  const tacticsController = useTacticsController(engine);
  const boardController = useBoardController(appState, {
    step,
    engine,
    boardPosition,
    boardInteractionMode,
    variationMoveSquares,
    candidateMoveSquares: candidateState.moveSquares,
    threatViewEnabled: tacticsController.threatViewEnabled,
    threatSquareStyles: tacticsController.threatSquareStyles,
    candidateCanMove,
    candidateCanStartFromMainline,
    candidateControlledColor,
    handleCandidateDrop,
    exitCandidateLab,
  });
  return {
    ...appState,
    ...cloudController,
    ...dataController,
    ...libraryController,
    ...coachController,
    ...tacticsController,
    ...candidateController,
    ...boardController,
    ...trainingController,
    step,
    engine,
    aiCacheKey,
    aiExplanation,
    quality,
    headers,
    openingsByPly,
    currentOpening,
    gameOpening,
    totalMoves,
    hasApiKey,
    providerLabel,
    models,
    whiteEvaluationPercent,
    evaluationLeader,
    evaluationScoreAtTop,
    boardMoveBadge,
    boardMoveBadgePosition,
    dashboardStats,
    boardPosition,
    boardInteractionMode,
    variationMoveSquares,
    activeProfile,
    playerMoveSummary,
    activeProfileLabel,
    accountInitial,
    cloudAccountLabel,
    accountSwitchBusy,
    movePairs,
    toggleSfx,
    toggleSidebar,
  };
}

export type AppController = ReturnType<typeof useAppController>;
