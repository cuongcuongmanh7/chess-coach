import type { AnalysisStep } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import type {
  TrainingCard,
  TrainingCardSeed,
  TrainingFilters,
} from "./types";

export const EMPTY_TRAINING_FILTERS: TrainingFilters = {
  phase: "",
  color: "",
  opening: "",
  tag: "",
  timeClass: "",
  dateFrom: "",
  dateTo: "",
};

export function buildTrainingSeeds(
  steps: AnalysisStep[],
  engineCache: Record<number, EngineMoveAnalysis>,
): TrainingCardSeed[] {
  return steps.flatMap((step) => {
    const engine = engineCache[step.ply];
    if (!engine || !["inaccuracy", "mistake", "blunder"].includes(engine.quality)) {
      return [];
    }
    return [{
      ply: step.ply,
      fen: step.fenBefore,
      side_to_move: step.color,
      played_move: step.san,
      best_move: engine.bestMoveSan,
      best_line: engine.bestLineSan.slice(0, 20),
      quality: engine.quality as TrainingCardSeed["quality"],
      centipawn_loss: engine.centipawnLoss,
      phase: step.phase,
      tags: step.tags,
    }];
  });
}

export function filterTrainingCards(
  cards: TrainingCard[],
  filters: TrainingFilters,
) {
  return cards.filter((card) => {
    if (filters.phase && card.phase !== filters.phase) return false;
    if (filters.color && card.side_to_move !== filters.color) return false;
    if (filters.opening && card.opening !== filters.opening) return false;
    if (filters.tag && !card.tags.includes(filters.tag)) return false;
    if (filters.timeClass && card.time_class !== filters.timeClass) return false;
    const date = card.game_date?.slice(0, 10) || "";
    if (filters.dateFrom && date < filters.dateFrom) return false;
    if (filters.dateTo && date > filters.dateTo) return false;
    return true;
  });
}

export function uniqueTrainingValues(
  cards: TrainingCard[],
  select: (card: TrainingCard) => string | null,
) {
  return Array.from(new Set(cards.map(select).filter(Boolean) as string[])).sort(
    (left, right) => left.localeCompare(right, "vi"),
  );
}
