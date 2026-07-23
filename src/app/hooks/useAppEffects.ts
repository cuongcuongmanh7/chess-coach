import { useEffect, useLayoutEffect } from "react";
import type { AnalysisStep } from "../../analysis";
import {
  observeFirebaseUser,
  type User as FirebaseUser,
} from "../../firebase";
import { coachRepository } from "../../features/coach/services/coachRepository";
import { isTauri } from "../../shared/services/tauriClient";
import { playSfx } from "../../sfx";
import { analyzeMoveWithStockfish, type EngineMoveAnalysis } from "../../stockfish";
import type { useCloudController } from "./useCloudController";
import type { useDataController } from "./useDataController";
import type { AppState } from "./useAppState";

type CloudController = ReturnType<typeof useCloudController>;
type DataController = ReturnType<typeof useDataController>;
type EffectDependencies = {
  step: AnalysisStep;
  engine: EngineMoveAnalysis | undefined;
  syncCloud: CloudController["syncCloud"];
  refreshProfiles: CloudController["refreshProfiles"];
  refreshSavedGames: CloudController["refreshSavedGames"];
  persistEngineResult: DataController["persistEngineResult"];
};

export function useAppEffects(
  state: AppState,
  {
    step,
    engine,
    syncCloud,
    refreshProfiles,
    refreshSavedGames,
    persistEngineResult,
  }: EffectDependencies,
) {
  const {
    analysis,
    currentIndex,
    setCurrentIndex,
    importOpen,
    libraryOpen,
    dashboardOpen,
    profilesOpen,
    settingsOpen,
    accountOpen,
    firebaseUser,
    setFirebaseUser,
    setAuthLoading,
    setLastCloudSyncAt,
    currentGameId,
    input,
    error,
    activeProfileId,
    syncNotice,
    setSyncNotice,
    setEngineCache,
    setEngineLoading,
    setEngineError,
    retryState,
    setRetryState,
    setPromotionPending,
    variationState,
    setVariationState,
    variationPlaying,
    setVariationPlaying,
    summaryOpen,
    fullAnalysis,
    setAiError,
    setHasApiKeys,
    fullAnalysisAbortRef,
    timelineScrollerRef,
    coachScrollerRef,
    cloudRetryTimerRef,
    cloudSyncedUserRef,
    previousMoveIndexRef,
    modalWasOpenRef,
    analysisWasCompleteRef,
  } = state;
  useEffect(() => observeFirebaseUser((user) => {
    setFirebaseUser(user);
    setLastCloudSyncAt(user
      ? localStorage.getItem(`kypho-cloud-last-sync:${user.uid}`)
      : null);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    if (!firebaseUser || cloudSyncedUserRef.current === firebaseUser.uid) return;
    cloudSyncedUserRef.current = firebaseUser.uid;
    void syncCloud(firebaseUser, false);
  }, [firebaseUser, syncCloud]);

  useEffect(() => {
    const handleOnline = () => {
      if (firebaseUser) void syncCloud(firebaseUser, false);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [firebaseUser, syncCloud]);

  useEffect(() => () => {
    if (cloudRetryTimerRef.current !== null) {
      window.clearTimeout(cloudRetryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    Promise.all([
      coachRepository.hasApiKey("openai"),
      coachRepository.hasApiKey("gemini"),
    ])
      .then(([openai, gemini]) => setHasApiKeys({ openai, gemini }))
      .catch(() => setHasApiKeys({ openai: false, gemini: false }));
  }, []);

  useEffect(() => {
    if (!syncNotice) return;
    if (syncNotice.type === "success") playSfx("success");
    if (syncNotice.type === "error") playSfx("error");
    const timeout = window.setTimeout(() => setSyncNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [syncNotice]);

  useEffect(() => {
    if (previousMoveIndexRef.current !== null && previousMoveIndexRef.current !== currentIndex) {
      const san = analysis.steps[currentIndex]?.san || "";
      if (/^O-O/.test(san)) playSfx("castle");
      else if (/[+#]$/.test(san)) playSfx("check");
      else if (san.includes("x")) playSfx("capture");
      else playSfx("move");
    }
    previousMoveIndexRef.current = currentIndex;
  }, [analysis.steps, currentIndex]);

  useEffect(() => {
    const modalOpen = importOpen
      || libraryOpen
      || dashboardOpen
      || profilesOpen
      || settingsOpen
      || accountOpen
      || summaryOpen;
    if (modalOpen && !modalWasOpenRef.current) playSfx("open");
    modalWasOpenRef.current = modalOpen;
  }, [accountOpen, dashboardOpen, importOpen, libraryOpen, profilesOpen, settingsOpen, summaryOpen]);

  useEffect(() => {
    if (fullAnalysis.complete && !analysisWasCompleteRef.current) playSfx("success");
    analysisWasCompleteRef.current = fullAnalysis.complete;
  }, [fullAnalysis.complete]);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    if (activeProfileId) void refreshSavedGames();
  }, [activeProfileId, refreshSavedGames]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("textarea, input, select")) return;
      if (variationState) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setVariationPlaying(false);
          setVariationState((value) => value ? {
            ...value,
            index: event.key === "ArrowLeft"
              ? Math.max(0, value.index - 1)
              : Math.min(value.positions.length - 1, value.index + 1),
          } : value);
        }
        return;
      }
      if (retryState) return;
      if (event.key === "ArrowLeft") setCurrentIndex((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") {
        setCurrentIndex((value) => Math.min(analysis.steps.length - 1, value + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [analysis.steps.length, retryState, variationState]);

  useEffect(() => {
    const scroller = timelineScrollerRef.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-step-index="${currentIndex}"]`);
    if (!scroller || !target) return;
    const centeredLeft = target.offsetLeft - scroller.clientWidth / 2 + target.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, centeredLeft), behavior: "smooth" });
  }, [currentIndex]);

  useLayoutEffect(() => {
    if (coachScrollerRef.current) coachScrollerRef.current.scrollTop = 0;
  }, [step.ply]);

  useEffect(() => {
    if (engine?.depth && engine.depth >= 13) {
      setEngineLoading(false);
      setEngineError("");
      return;
    }
    const controller = new AbortController();
    setEngineLoading(true);
    setEngineError("");

    analyzeMoveWithStockfish(step.fenBefore, step.fenAfter, step.lan, controller.signal)
      .then((result) => {
        setEngineCache((cache) => {
          if ((cache[step.ply]?.depth || 0) >= result.depth) return cache;
          return { ...cache, [step.ply]: result };
        });
        if (currentGameId) {
          void persistEngineResult(currentGameId, step, result).catch(() => undefined);
        }
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setEngineError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setEngineLoading(false);
      });

    return () => controller.abort();
  }, [currentGameId, engine?.depth, persistEngineResult, step]);

  useEffect(() => () => fullAnalysisAbortRef.current?.abort(), []);

  useEffect(() => {
    setAiError("");
    setRetryState(null);
    setPromotionPending(null);
    setVariationState(null);
    setVariationPlaying(false);
  }, [step.ply]);

  useEffect(() => {
    if (!variationPlaying || !variationState) return;
    if (variationState.index >= variationState.positions.length - 1) {
      setVariationPlaying(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      setVariationState((value) => value
        ? { ...value, index: Math.min(value.positions.length - 1, value.index + 1) }
        : value);
    }, 850);
    return () => window.clearTimeout(timeout);
  }, [variationPlaying, variationState]);


  return {

  };
}
