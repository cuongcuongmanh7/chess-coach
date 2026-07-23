import { useCallback, useMemo } from "react";
import type { AnalysisStep, GameAnalysis, MoveQuality } from "../../analysis";
import { buildDashboardStats } from "../../dashboard";
import type { OpeningInfo } from "../../openings";
import type { EngineMoveAnalysis } from "../../stockfish";
import { QUALITY_LABELS } from "../constants";
import type { PlayerSummary } from "../types";
import { analysisRepository } from "../../features/analysis/services/analysisRepository";
import { profileRepository } from "../../features/profiles/services/profileRepository";
import { isTauri } from "../../shared/services/tauriClient";
import type { PlayerProfile } from "../../shared/types/tauri";
import type { useCloudController } from "./useCloudController";
import type { AppState } from "./useAppState";

type CloudController = ReturnType<typeof useCloudController>;
type DataDependencies = {
  syncCloud: CloudController["syncCloud"];
  refreshProfiles: CloudController["refreshProfiles"];
  refreshSavedGames: CloudController["refreshSavedGames"];
  gameOpening: OpeningInfo | null;
  headers: GameAnalysis["headers"];
};

export function useDataController(
  state: AppState,
  {
    syncCloud,
    refreshProfiles,
    refreshSavedGames,
    gameOpening,
    headers,
  }: DataDependencies,
) {
  const {
    analysis,
    setDashboardOpen,
    firebaseUser,
    error,
    setDashboardRecords,
    setDashboardLoading,
    setDashboardError,
    profilesLoading,
    setProfilesLoading,
    setProfilesError,
    activeProfileId,
    setActiveProfileId,
    newProfilePlatform,
    newProfileUsername,
    setNewProfileUsername,
    setSyncStatus,
    engineCache,
    setEngineCache,
    setEngineError,
    fullAnalysis,
    setFullAnalysis,
    activeProfileStorageKeyRef,
  } = state;
  const persistEngineResult = useCallback(async (
    gameId: string,
    item: AnalysisStep,
    result: EngineMoveAnalysis,
  ) => {
    if (!isTauri()) return;
    await analysisRepository.save({
        game_id: gameId,
        ply: item.ply,
        depth: result.depth,
        result,
        color: item.color,
        phase: item.phase,
        quality: result.quality,
        centipawn_loss: result.centipawnLoss,
        think_time_seconds: item.thinkTimeSeconds,
        is_quick: item.isQuickMove,
        is_time_pressure: item.isTimePressure,
        tags: item.tags,
    });
  }, []);

  const hydrateEngineCache = useCallback(async (gameId: string, next: GameAnalysis) => {
    if (!isTauri()) return;
    try {
      const stored = await analysisRepository.list(gameId);
      const cache = stored.reduce<Record<number, EngineMoveAnalysis>>((values, item) => {
        if (item.result && item.result.depth >= item.depth) values[item.ply] = item.result;
        return values;
      }, {});
      setEngineCache(cache);
      const complete = next.steps.length > 0 && next.steps.every((item) => Boolean(cache[item.ply]));
      if (complete) void analysisRepository.markComplete(gameId).catch(() => undefined);
      setFullAnalysis({
        running: false,
        complete,
        completed: Object.keys(cache).length,
        total: next.steps.length,
        error: "",
      });
    } catch (reason) {
      setEngineError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const openDashboard = useCallback(async () => {
    setDashboardOpen(true);
    setDashboardLoading(true);
    setDashboardError("");
    try {
      if (!isTauri()) throw new Error("Dashboard cần mở trong ứng dụng desktop.");
      if (!activeProfileId) throw new Error("Hãy chọn một hồ sơ người chơi.");
      setDashboardRecords(await analysisRepository.dashboard(activeProfileId));
    } catch (reason) {
      setDashboardError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDashboardLoading(false);
    }
  }, [activeProfileId]);

  const changeActiveProfile = (profileId: number) => {
    setActiveProfileId(profileId);
    localStorage.setItem(activeProfileStorageKeyRef.current, String(profileId));
    setDashboardRecords([]);
    setDashboardError("");
    setSyncStatus("");
  };

  const addPlayerProfile = async () => {
    if (!isTauri() || profilesLoading) return;
    setProfilesLoading(true);
    setProfilesError("");
    try {
      const created = await profileRepository.add(
        newProfilePlatform,
        newProfileUsername.trim(),
      );
      setNewProfileUsername("");
      await refreshProfiles(created.id);
      if (firebaseUser) void syncCloud(firebaseUser, false);
    } catch (reason) {
      setProfilesError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setProfilesLoading(false);
    }
  };

  const removePlayerProfile = async (profile: PlayerProfile) => {
    if (!isTauri() || profilesLoading) return;
    const platform = profile.platform === "chesscom" ? "Chess.com" : "Lichess";
    if (!window.confirm(`Xoá hồ sơ ${platform} · ${profile.username}? Các ván đã tải vẫn được giữ${firebaseUser ? ", nhưng hồ sơ sẽ bị xoá khỏi các thiết bị đã đồng bộ" : " trên máy"}.`)) return;
    setProfilesLoading(true);
    setProfilesError("");
    try {
      await profileRepository.remove(profile.id);
      await refreshProfiles();
      if (firebaseUser) void syncCloud(firebaseUser, false);
    } catch (reason) {
      setProfilesError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setProfilesLoading(false);
    }
  };

  const fullGameSummary = useMemo(() => {
    const buildPlayerSummary = (color: "w" | "b"): PlayerSummary => {
      const results = analysis.steps
        .filter((item) => item.color === color)
        .map((item) => engineCache[item.ply])
        .filter((item): item is EngineMoveAnalysis => Boolean(item));
      const counts: Record<MoveQuality, number> = {
        best: 0,
        good: 0,
        inaccuracy: 0,
        mistake: 0,
        blunder: 0,
      };
      results.forEach((item) => { counts[item.quality] += 1; });
      const totalLoss = results.reduce((sum, item) => sum + item.centipawnLoss, 0);
      return {
        moves: results.length,
        acpl: results.length ? Math.round(totalLoss / results.length) : 0,
        bestGoodRate: results.length ? Math.round(((counts.best + counts.good) / results.length) * 100) : 0,
        counts,
      };
    };

    const critical = analysis.steps
      .map((item, index) => ({ item, index, engine: engineCache[item.ply] }))
      .filter(({ engine: result }) => result?.quality === "mistake" || result?.quality === "blunder");

    const timed = analysis.steps.filter((item) => item.thinkTimeSeconds !== null);
    const timedErrors = timed.filter((item) => {
      const result = engineCache[item.ply];
      return result?.quality === "mistake" || result?.quality === "blunder";
    });

    return {
      white: buildPlayerSummary("w"),
      black: buildPlayerSummary("b"),
      critical,
      time: {
        available: timed.length > 0,
        average: timed.length
          ? Math.round(timed.reduce((sum, item) => sum + (item.thinkTimeSeconds || 0), 0) / timed.length)
          : 0,
        quickErrors: timedErrors.filter((item) => item.isQuickMove).length,
        pressureErrors: timedErrors.filter((item) => item.isTimePressure).length,
      },
    };
  }, [analysis.steps, engineCache]);

  const gameSummaryRequest = useMemo(() => {
    if (!fullAnalysis.complete) return null;
    const playerData = (side: "white" | "black", stats: PlayerSummary) => ({
      name: side === "white" ? headers.White || "Trắng" : headers.Black || "Đen",
      elo: side === "white" ? headers.WhiteElo || null : headers.BlackElo || null,
      moves: stats.moves,
      acpl: stats.acpl,
      best_good_rate: stats.bestGoodRate,
      counts: stats.counts,
    });
    const allCriticalPositions = fullGameSummary.critical
      .flatMap(({ item, engine: result }) => result ? [{
        move_number: item.moveNumber,
        side: item.color === "w" ? "Trắng" : "Đen",
        played_move: item.san,
        quality: QUALITY_LABELS[result.quality],
        centipawn_loss: Math.round(result.centipawnLoss),
        evaluation: result.evaluation,
        best_move: result.bestMoveSan,
      }] : []);
    const criticalPositions = (["Trắng", "Đen"] as const).flatMap((side) =>
      allCriticalPositions
        .filter((position) => position.side === side)
        .sort((left, right) => right.centipawn_loss - left.centipawn_loss)
        .slice(0, 4),
    );
    return {
      opening: gameOpening ? `${gameOpening.eco} · ${gameOpening.name}` : headers.ECO || "Không rõ khai cuộc",
      result: headers.Result || "*",
      total_plies: analysis.steps.length,
      white: playerData("white", fullGameSummary.white),
      black: playerData("black", fullGameSummary.black),
      critical_positions: criticalPositions,
    };
  }, [analysis.steps.length, fullAnalysis.complete, fullGameSummary, gameOpening, headers]);


  return {
    persistEngineResult,
    hydrateEngineCache,
    openDashboard,
    changeActiveProfile,
    addPlayerProfile,
    removePlayerProfile,
    fullGameSummary,
    gameSummaryRequest,
  };
}
