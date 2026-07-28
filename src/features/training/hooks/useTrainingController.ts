import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzePgn, type AnalysisStep } from "../../../analysis";
import type { EngineMoveAnalysis } from "../../../stockfish";
import { isTauri } from "../../../shared/services/tauriClient";
import { analysisRepository } from "../../analysis/services/analysisRepository";
import { buildEngineCacheFromStored } from "../../analysis/engineCache";
import { tacticCodes } from "../../tactics/detector.ts";
import { trainingRepository } from "../services/trainingRepository";
import { markSyncedPreferencesChanged } from "../../cloud/services/preferencesDirty";
import type {
  TrainingCard,
  TrainingFilters,
  TrainingQueue,
  TrainingStats,
} from "../types";
import {
  buildTrainingSeeds,
  EMPTY_TRAINING_FILTERS,
  filterTrainingCards,
} from "../utils";
import { useTrainingSession } from "./useTrainingSession";

const EMPTY_STATS: TrainingStats = {
  total: 0,
  due: 0,
  new_cards: 0,
  mastered: 0,
  attempts: 0,
  first_try_correct_rate: 0,
  average_hints: 0,
  streak_days: 0,
};

export function useTrainingController(
  activeProfileId: number | null,
  onProgressChanged: () => void,
) {
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [trainingQueue, setTrainingQueue] = useState<TrainingQueue>("due");
  const [trainingCards, setTrainingCards] = useState<TrainingCard[]>([]);
  const [trainingStats, setTrainingStats] = useState(EMPTY_STATS);
  const [trainingFilters, setTrainingFilters] = useState<TrainingFilters>(EMPTY_TRAINING_FILTERS);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingError, setTrainingError] = useState("");
  const [includeInaccuracies, setIncludeInaccuraciesState] = useState(
    () => localStorage.getItem("kypho-training-inaccuracies") === "true",
  );
  useEffect(() => {
    const applyCloudPreferences = (event: Event) => {
      const detail = (event as CustomEvent<{ include_inaccuracies?: boolean }>).detail;
      if (typeof detail?.include_inaccuracies === "boolean") {
        setIncludeInaccuraciesState(detail.include_inaccuracies);
      }
    };
    window.addEventListener("kypho-cloud-preferences", applyCloudPreferences);
    return () => window.removeEventListener("kypho-cloud-preferences", applyCloudPreferences);
  }, []);

  const filteredTrainingCards = useMemo(
    () => filterTrainingCards(trainingCards, trainingFilters),
    [trainingCards, trainingFilters],
  );
  const replaceCard = useCallback((updated: TrainingCard) => {
    setTrainingCards((cards) => cards.map((card) => card.id === updated.id ? updated : card));
  }, []);
  const sessionController = useTrainingSession({
    activeProfileId,
    cards: filteredTrainingCards,
    replaceCard,
    setStats: setTrainingStats,
    setError: setTrainingError,
    onProgressChanged,
  });

  const refreshTraining = useCallback(async () => {
    if (!activeProfileId || !isTauri()) {
      setTrainingCards([]);
      setTrainingStats(EMPTY_STATS);
      return;
    }
    setTrainingLoading(true);
    setTrainingError("");
    try {
      const [cards, stats] = await Promise.all([
        trainingRepository.list(activeProfileId, trainingQueue),
        trainingRepository.stats(activeProfileId),
      ]);
      setTrainingCards(cards);
      setTrainingStats(stats);
      sessionController.setTrainingSession(null);
    } catch (reason) {
      setTrainingError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setTrainingLoading(false);
    }
  }, [activeProfileId, sessionController.setTrainingSession, trainingQueue]);

  // Chỉ tải stats (nhẹ) để badge "đến hạn" hiển thị ngay cả khi modal đóng.
  const refreshTrainingStats = useCallback(async () => {
    if (!activeProfileId || !isTauri()) {
      setTrainingStats(EMPTY_STATS);
      return;
    }
    try {
      setTrainingStats(await trainingRepository.stats(activeProfileId));
    } catch {
      // Im lặng: badge chỉ là phụ trợ, không chặn luồng chính.
    }
  }, [activeProfileId]);

  useEffect(() => {
    if (trainingOpen) void refreshTraining();
    else void refreshTrainingStats();
  }, [refreshTraining, refreshTrainingStats, trainingOpen]);

  const openTraining = useCallback(() => {
    setTrainingOpen(true);
  }, []);

  const closeTraining = useCallback(() => {
    setTrainingOpen(false);
    sessionController.setTrainingSession(null);
  }, [sessionController.setTrainingSession]);

  const generateCardsForGame = useCallback(async (
    gameId: string,
    steps: AnalysisStep[],
    engineCache: Record<number, EngineMoveAnalysis>,
  ) => {
    if (!activeProfileId || !isTauri()) return { created: 0, eligible: 0 };
    const result = await trainingRepository.generate({
      game_id: gameId,
      profile_id: activeProfileId,
      include_inaccuracies: includeInaccuracies,
      cards: buildTrainingSeeds(steps, engineCache),
    });
    if (trainingOpen) void refreshTraining();
    else void refreshTrainingStats();
    return result;
  }, [activeProfileId, includeInaccuracies, refreshTraining, refreshTrainingStats, trainingOpen]);

  // Dựng lại thẻ Mistake Lab cho các ván đã phân tích nhưng chưa có thẻ (điển
  // hình sau khi khôi phục dữ liệu cloud trên máy mới). Thẻ là dữ liệu dẫn xuất,
  // không được đồng bộ; ta tạo lại từ PGN + engine_analyses đã có, và bước tạo
  // thẻ tự áp tiến độ ôn (training_progress_inbox) đang chờ.
  const rebuildTrainingCards = useCallback(async () => {
    if (!isTauri()) return { rebuilt: 0, games: 0 };
    const targets = await trainingRepository.rebuildTargets(includeInaccuracies);
    if (!targets.length) return { rebuilt: 0, games: 0 };
    const byGame = new Map<string, { pgn: string; profileIds: number[] }>();
    for (const target of targets) {
      const entry = byGame.get(target.game_id) ?? { pgn: target.pgn, profileIds: [] };
      entry.profileIds.push(target.profile_id);
      byGame.set(target.game_id, entry);
    }
    let rebuilt = 0;
    for (const [gameId, { pgn, profileIds }] of byGame) {
      try {
        const parsed = analyzePgn(pgn);
        const stored = await analysisRepository.list(gameId);
        const { cache, reclassified } = buildEngineCacheFromStored(parsed.steps, parsed.headers, stored);
        // Ghi lại phân loại/nhãn đã đổi TRƯỚC khi tạo thẻ: generate_training_cards
        // đối chiếu seed với engine_analyses, nếu lệch sẽ bỏ qua nước đó.
        if (reclassified.length) {
          await Promise.allSettled(reclassified.map(({ step, result }) =>
            analysisRepository.save({
              game_id: gameId,
              ply: step.ply,
              depth: result.depth,
              result,
              color: step.color,
              phase: step.phase,
              quality: result.quality,
              centipawn_loss: result.centipawnLoss,
              think_time_seconds: step.thinkTimeSeconds,
              is_quick: step.isQuickMove,
              is_time_pressure: step.isTimePressure,
              tags: tacticCodes(result),
            })));
        }
        const cards = buildTrainingSeeds(parsed.steps, cache);
        for (const profileId of profileIds) {
          const result = await trainingRepository.generate({
            game_id: gameId,
            profile_id: profileId,
            include_inaccuracies: includeInaccuracies,
            cards,
          });
          rebuilt += result.created;
        }
      } catch {
        // Bỏ qua ván lỗi (PGN hỏng…) để không chặn các ván còn lại.
      }
    }
    if (trainingOpen) void refreshTraining();
    else void refreshTrainingStats();
    return { rebuilt, games: byGame.size };
  }, [includeInaccuracies, refreshTraining, refreshTrainingStats, trainingOpen]);

  const updateTrainingCard = useCallback(async (
    card: TrainingCard,
    changes: { starred?: boolean; suspended?: boolean },
  ) => {
    try {
      replaceCard(await trainingRepository.update({ card_id: card.id, ...changes }));
      onProgressChanged();
    } catch (reason) {
      setTrainingError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [onProgressChanged, replaceCard]);

  const setIncludeInaccuracies = useCallback((value: boolean) => {
    localStorage.setItem("kypho-training-inaccuracies", String(value));
    markSyncedPreferencesChanged();
    setIncludeInaccuraciesState(value);
    onProgressChanged();
  }, [onProgressChanged]);

  return {
    trainingOpen,
    setTrainingOpen,
    trainingQueue,
    setTrainingQueue,
    trainingCards,
    trainingStats,
    trainingFilters,
    setTrainingFilters,
    trainingLoading,
    trainingError,
    ...sessionController,
    filteredTrainingCards,
    includeInaccuracies,
    setIncludeInaccuracies,
    openTraining,
    closeTraining,
    refreshTraining,
    refreshTrainingStats,
    generateCardsForGame,
    rebuildTrainingCards,
    updateTrainingCard,
  };
}
