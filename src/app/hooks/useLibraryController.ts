import { analyzePgn } from "../../analysis";
import { lastKnownOpening } from "../../openings";
import {
  getPgnPlayedAt,
  inferSourcePlatform,
  inferTimeClass,
  isChessComLink,
} from "../../features/library/utils";
import { gameRepository } from "../../features/library/services/gameRepository";
import { profileRepository } from "../../features/profiles/services/profileRepository";
import { isTauri } from "../../shared/services/tauriClient";
import type { PlayerProfile, SavedGameSummary } from "../../shared/types/tauri";
import type { useCloudController } from "./useCloudController";
import type { useDataController } from "./useDataController";
import type { AppState } from "./useAppState";

type CloudController = ReturnType<typeof useCloudController>;
type DataController = ReturnType<typeof useDataController>;
type LibraryDependencies = {
  activeProfile: PlayerProfile | null;
  syncCloud: CloudController["syncCloud"];
  refreshProfiles: CloudController["refreshProfiles"];
  refreshSavedGames: CloudController["refreshSavedGames"];
  hydrateEngineCache: DataController["hydrateEngineCache"];
};

export function useLibraryController(
  state: AppState,
  {
    activeProfile,
    syncCloud,
    refreshProfiles,
    refreshSavedGames,
    hydrateEngineCache,
  }: LibraryDependencies,
) {
  const {
    setAnalysis,
    setCurrentIndex,
    setImportOpen,
    setLibraryOpen,
    firebaseUser,
    setCurrentGameId,
    input,
    setInput,
    error,
    setError,
    loading,
    setLoading,
    savedGames,
    libraryLoading,
    setLibraryLoading,
    setLibraryError,
    syncTimeClass,
    setSyncStatus,
    setSyncNotice,
    setSyncProgress,
    setEngineCache,
    setRetryState,
    setPromotionPending,
    setVariationState,
    setVariationPlaying,
    setSummaryOpen,
    setFullAnalysis,
    setGameCoachSummary,
    setGameCoachLoading,
    setGameCoachError,
    setAiCache,
    cacheLookupsRef,
    cacheMissesRef,
    autoAttemptsRef,
    fullAnalysisAbortRef,
  } = state;
  const loadAnalysis = (pgn: string, gameId: string | null = null) => {
    const next = analyzePgn(pgn);
    fullAnalysisAbortRef.current?.abort();
    fullAnalysisAbortRef.current = null;
    setAnalysis(next);
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
    setFullAnalysis({ running: false, complete: false, completed: 0, total: next.steps.length, error: "" });
    cacheLookupsRef.current.clear();
    cacheMissesRef.current.clear();
    autoAttemptsRef.current.clear();
    setImportOpen(false);
    setInput("");
    setError("");
    if (gameId) void hydrateEngineCache(gameId, next);
    return next;
  };

  const handleImport = async () => {
    setError("");
    setLoading(true);
    try {
      const importedValue = input.trim();
      const sourceUrl = isChessComLink(importedValue) ? importedValue : null;
      let pgn = importedValue;
      if (sourceUrl) {
        if (!isTauri()) throw new Error("Tải link Chess.com cần mở app Tauri. Bản web chỉ nhận PGN.");
        pgn = await gameRepository.fetchChessComGame(pgn);
      }
      const importedAnalysis = analyzePgn(pgn);
      const inferredOpening = lastKnownOpening(importedAnalysis.steps);
      if (isTauri()) {
        try {
          const gameId = await gameRepository.save({
              pgn: importedAnalysis.rawPgn,
              white: importedAnalysis.headers.White || "Trắng",
              black: importedAnalysis.headers.Black || "Đen",
              white_elo: importedAnalysis.headers.WhiteElo || null,
              black_elo: importedAnalysis.headers.BlackElo || null,
              result: importedAnalysis.headers.Result || null,
              event: importedAnalysis.headers.Event || null,
              date: importedAnalysis.headers.UTCDate || importedAnalysis.headers.Date || null,
              played_at: getPgnPlayedAt(importedAnalysis.headers),
              eco: inferredOpening?.eco || importedAnalysis.headers.ECO || null,
              opening: inferredOpening?.name || importedAnalysis.headers.Opening || null,
              time_control: importedAnalysis.headers.TimeControl || null,
              time_class: inferTimeClass(importedAnalysis.headers.TimeControl) || null,
              source_url: sourceUrl,
              source_platform: inferSourcePlatform(sourceUrl || importedAnalysis.headers.Link || importedAnalysis.headers.Site),
          });
          loadAnalysis(pgn, gameId);
          await refreshSavedGames();
          if (firebaseUser) void syncCloud(firebaseUser, false);
        } catch (reason) {
          setLibraryError(reason instanceof Error ? reason.message : String(reason));
          loadAnalysis(pgn);
        }
      } else {
        loadAnalysis(pgn);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const syncRecentGames = async () => {
    if (!isTauri() || loading) return;
    setError("");
    setSyncStatus("");
    setSyncNotice(null);
    setSyncProgress({ phase: "fetching", completed: 0, total: 20 });
    setLoading(true);
    try {
      if (!activeProfile) throw new Error("Hãy chọn một hồ sơ người chơi.");
      const username = activeProfile.username;
      const pgns = await gameRepository.fetchRecent({
          platform: activeProfile.platform,
          username,
          limit: 20,
          time_class: syncTimeClass === "all" ? null : syncTimeClass,
      });
      if (!pgns.length) throw new Error("Không tìm thấy ván phù hợp với bộ lọc.");
      setSyncProgress({ phase: "saving", completed: 0, total: pgns.length });

      const knownIds = new Set(savedGames.map((game) => game.id));
      let imported = 0;
      let skipped = 0;
      for (const [index, pgn] of pgns.entries()) {
        try {
          const parsed = analyzePgn(pgn);
          const inferredOpening = lastKnownOpening(parsed.steps);
          const sourceUrl = parsed.headers.Link || parsed.headers.Site || null;
          const id = await gameRepository.save({
              pgn: parsed.rawPgn,
              white: parsed.headers.White || "Trắng",
              black: parsed.headers.Black || "Đen",
              white_elo: parsed.headers.WhiteElo || null,
              black_elo: parsed.headers.BlackElo || null,
              result: parsed.headers.Result || null,
              event: parsed.headers.Event || null,
              date: parsed.headers.UTCDate || parsed.headers.Date || null,
              played_at: getPgnPlayedAt(parsed.headers),
              eco: inferredOpening?.eco || parsed.headers.ECO || null,
              opening: inferredOpening?.name || parsed.headers.Opening || null,
              time_control: parsed.headers.TimeControl || null,
              time_class: syncTimeClass === "all"
                ? inferTimeClass(parsed.headers.TimeControl)
                : syncTimeClass,
              source_url: sourceUrl,
              source_platform: activeProfile.platform,
          });
          if (knownIds.has(id)) skipped += 1;
          else {
            knownIds.add(id);
            imported += 1;
          }
        } catch {
          skipped += 1;
        } finally {
          setSyncProgress({ phase: "saving", completed: index + 1, total: pgns.length });
        }
      }
      await profileRepository.markSynced(activeProfile.id);
      await refreshProfiles(activeProfile.id);
      await refreshSavedGames();
      if (firebaseUser) void syncCloud(firebaseUser, false);
      const message = imported > 0
        ? `Đồng bộ hoàn tất: đã thêm ${imported} ván mới${skipped ? `, bỏ qua ${skipped} ván đã có hoặc không hợp lệ` : ""}.`
        : `Đồng bộ hoàn tất: không có ván mới${skipped ? `; ${skipped} ván đã có hoặc không hợp lệ` : ""}.`;
      setSyncStatus(message);
      setSyncNotice({ type: imported > 0 ? "success" : "info", message });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setSyncNotice({ type: "error", message: `Đồng bộ thất bại: ${message}` });
    } finally {
      setSyncProgress(null);
      setLoading(false);
    }
  };

  const openStoredGame = async (id: string) => {
    if (!isTauri() || libraryLoading) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const saved = await gameRepository.open(id);
      loadAnalysis(saved.pgn, saved.id);
      await refreshSavedGames();
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLibraryLoading(false);
    }
  };

  const removeStoredGame = async (game: SavedGameSummary) => {
    if (!isTauri() || libraryLoading) return;
    if (!window.confirm(`Xoá ván ${game.white} — ${game.black} khỏi Kho ván${firebaseUser ? " trên mọi thiết bị đã đồng bộ" : ""}?`)) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      await gameRepository.remove(game.id);
      await refreshSavedGames();
      if (firebaseUser) void syncCloud(firebaseUser, false);
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLibraryLoading(false);
    }
  };


  return {
    loadAnalysis,
    handleImport,
    syncRecentGames,
    openStoredGame,
    removeStoredGame,
  };
}
