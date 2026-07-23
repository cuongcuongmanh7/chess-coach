import type { Phase } from "../../analysis";

export type TrainingQueue = "due" | "new" | "mastered" | "starred" | "suspended" | "all";

export type TrainingCardSeed = {
  ply: number;
  fen: string;
  side_to_move: "w" | "b";
  played_move: string;
  best_move: string;
  best_line: string[];
  quality: "inaccuracy" | "mistake" | "blunder";
  centipawn_loss: number;
  phase: Phase;
  tags: string[];
};

export type TrainingCard = {
  id: string;
  profile_id: number;
  game_id: string;
  ply: number;
  fen: string;
  side_to_move: "w" | "b";
  played_move: string;
  best_move: string;
  best_line: string[];
  quality: "inaccuracy" | "mistake" | "blunder";
  centipawn_loss: number;
  phase: Phase;
  opening: string | null;
  tags: string[];
  status: "new" | "learning" | "review" | "mastered";
  due_at: string;
  interval_days: number;
  correct_streak: number;
  attempts: number;
  lapses: number;
  starred: boolean;
  suspended: boolean;
  last_correct_at: string | null;
  time_class: string | null;
  game_date: string | null;
};

export type TrainingStats = {
  total: number;
  due: number;
  new_cards: number;
  mastered: number;
  attempts: number;
  first_try_correct_rate: number;
  average_hints: number;
  streak_days: number;
};

export type TrainingFilters = {
  phase: string;
  color: string;
  opening: string;
  tag: string;
  timeClass: string;
  dateFrom: string;
  dateTo: string;
};

export type TrainingFeedback = {
  kind: "wrong" | "continuation" | "complete";
  message: string;
  detail?: string;
};

export type TrainingSession = {
  index: number;
  fen: string;
  startedAt: number;
  hintsUsed: number;
  failedAttempts: number;
  loading: boolean;
  feedback: TrainingFeedback | null;
  attemptedMove: string | null;
  initialLoss: number | null;
  continuation: {
    from: string;
    to: string;
    san: string;
  } | null;
};
