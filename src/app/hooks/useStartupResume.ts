import { useEffect } from "react";
import { gameRepository } from "../../features/library/services/gameRepository";
import { isTauri } from "../../shared/services/tauriClient";
import type { AppState } from "./useAppState";

type LoadAnalysis = (pgn: string, gameId?: string | null) => unknown;

export function useStartupResume(
  state: AppState,
  loadAnalysis: LoadAnalysis,
) {
  const {
    activeProfileId,
    profilesInitialized,
    setLibraryError,
    setWorkspaceMode,
    startupDataReady,
    workspaceMode,
  } = state;

  useEffect(() => {
    if (workspaceMode !== "booting") return;
    if (!isTauri()) {
      setWorkspaceMode("empty");
      return;
    }
    if (!startupDataReady || !profilesInitialized) return;

    let cancelled = false;
    gameRepository.resume(activeProfileId)
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          loadAnalysis(saved.pgn, saved.id);
        } else {
          setWorkspaceMode("empty");
        }
      })
      .catch((reason) => {
        if (cancelled) return;
        setLibraryError(reason instanceof Error ? reason.message : String(reason));
        setWorkspaceMode("empty");
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeProfileId,
    loadAnalysis,
    profilesInitialized,
    setLibraryError,
    setWorkspaceMode,
    startupDataReady,
    workspaceMode,
  ]);
}
