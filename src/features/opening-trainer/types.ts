export type RepertoireColor = "w" | "b";

export type RepertoireSource = "history" | "stockfish" | "manual";

export type RepertoireNodeSeed = {
  node_key: string;
  parent_key: string | null;
  position_key: string;
  fen: string;
  move_san: string;
  move_uci: string;
  side_to_move: RepertoireColor;
  is_user_move: boolean;
  source: RepertoireSource;
  frequency: number;
  avg_cpl: number | null;
  comment: string | null;
};

export type Repertoire = {
  id: string;
  profile_id: number;
  color: RepertoireColor;
  name: string;
  eco: string | null;
  source: string;
  node_count: number;
  due_count: number;
  created_at: string;
  updated_at: string;
};

export type RepertoireNode = {
  id: string;
  repertoire_id: string;
  parent_id: string | null;
  position_key: string;
  fen: string;
  move_san: string;
  move_uci: string;
  side_to_move: RepertoireColor;
  is_user_move: boolean;
  source: RepertoireSource;
  frequency: number;
  avg_cpl: number | null;
  comment: string | null;
  status: string | null;
  due_at: string | null;
  interval_days: number;
  correct_count: number;
  wrong_count: number;
  correct_streak: number;
};

export type RepertoireProgress = {
  node_id: string;
  correct_count: number;
  wrong_count: number;
  correct_streak: number;
  status: string;
  interval_days: number;
  due_at: string;
  last_correct_at: string | null;
};
