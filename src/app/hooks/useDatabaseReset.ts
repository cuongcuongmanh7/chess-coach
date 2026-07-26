import { useCallback } from "react";
import type { AppState } from "./useAppState";

export function useDatabaseReset(state: AppState) {
  const {
    fullAnalysisAbortRef,
    setActiveProfileId,
    setAiCache,
    setCurrentGameId,
    setDashboardRecords,
    setEngineCache,
    setFullAnalysis,
    setGameCoachSummary,
    setProfiles,
    setProfilesInitialized,
    setSavedGames,
    setWorkspaceMode,
  } = state;

  return useCallback(() => {
    fullAnalysisAbortRef.current?.abort();
    fullAnalysisAbortRef.current = null;
    setWorkspaceMode("booting");
    setProfilesInitialized(false);
    setCurrentGameId(null);
    setProfiles([]);
    setSavedGames([]);
    setDashboardRecords([]);
    setActiveProfileId(null);
    setEngineCache({});
    setAiCache({});
    setGameCoachSummary(null);
    setFullAnalysis({
      running: false,
      complete: false,
      completed: 0,
      total: 0,
      error: "",
    });
  }, [
    fullAnalysisAbortRef,
    setActiveProfileId,
    setAiCache,
    setCurrentGameId,
    setDashboardRecords,
    setEngineCache,
    setFullAnalysis,
    setGameCoachSummary,
    setProfiles,
    setProfilesInitialized,
    setSavedGames,
    setWorkspaceMode,
  ]);
}
