import { invokeCommand } from "../../../shared/services/tauriClient";
import type {
  TrainingCard,
  TrainingCardSeed,
  TrainingQueue,
  TrainingStats,
} from "../types";

export const trainingRepository = {
  generate(request: {
    game_id: string;
    profile_id: number;
    include_inaccuracies: boolean;
    cards: TrainingCardSeed[];
  }) {
    return invokeCommand<{ created: number; eligible: number }>(
      "generate_training_cards",
      { request },
    );
  },
  list(profileId: number, queue: TrainingQueue) {
    return invokeCommand<TrainingCard[]>("list_training_cards", {
      request: { profile_id: profileId, queue },
    });
  },
  review(request: {
    card_id: string;
    attempted_move: string | null;
    centipawn_loss: number;
    hints_used: number;
    failed_attempts: number;
    duration_ms: number;
  }) {
    return invokeCommand<TrainingCard>("review_training_card", { request });
  },
  update(request: {
    card_id: string;
    starred?: boolean;
    suspended?: boolean;
  }) {
    return invokeCommand<TrainingCard>("update_training_card", { request });
  },
  stats(profileId: number) {
    return invokeCommand<TrainingStats>("get_training_stats", { profileId });
  },
};
