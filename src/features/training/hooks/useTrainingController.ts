import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalysisStep } from "../../../analysis";
import type { EngineMoveAnalysis } from "../../../stockfish";
import { isTauri } from "../../../shared/services/tauriClient";
import { trainingRepository } from "../services/trainingRepository";
import { markSyncedPreferencesChanged } from "../../cloud/services/cloudPreferences";
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

  useEffect(() => {
    if (trainingOpen) void refreshTraining();
  }, [refreshTraining, trainingOpen]);

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
    return result;
  }, [activeProfileId, includeInaccuracies, refreshTraining, trainingOpen]);

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
    generateCardsForGame,
    updateTrainingCard,
  };
}
