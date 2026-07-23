import type { MoveQuality, Phase } from "../../analysis";
import type { DisplayMoveQuality } from "../../features/analysis/moveClassification";
import type { DashboardMoveRecord } from "../../dashboard";
import type { EngineMoveAnalysis } from "../../stockfish";

export type SyncPlatform = "chesscom" | "lichess";
export type AiProvider = "openai" | "gemini";
export type AiExplanation = {
  text: string;
  provider: AiProvider;
  model: string;
  cached: boolean;
};

export type SavedGameSummary = {
  id: string;
  white: string;
  black: string;
  white_elo: string | null;
  black_elo: string | null;
  result: string | null;
  event: string | null;
  date: string | null;
  played_at: string | null;
  eco: string | null;
  opening: string | null;
  time_control: string | null;
  time_class: string | null;
  source_url: string | null;
  source_platform: SyncPlatform | null;
  analysis_complete: boolean;
  final_fen: string | null;
  ply_count: number | null;
  preview_pgn: string | null;
  created_at: string;
  last_opened_at: string;
};

export type SavedGameDetail = { id: string; pgn: string };
export type StoredEngineAnalysis = {
  ply: number;
  depth: number;
  result: EngineMoveAnalysis;
};

export type PlayerProfile = {
  id: number;
  platform: SyncPlatform;
  username: string;
  game_count: number;
  last_sync_at: string | null;
  created_at: string;
};

export type CloudMergeResult = {
  profiles_added: number;
  games_added: number;
  profiles_deleted: number;
  games_deleted: number;
  training_progress_merged: number;
};

export type CloudAckToken = {
  entity_type: "profile" | "game" | "training_progress";
  entity_id: string;
  generation: number;
};

export type DatabaseActivationResult = {
  changed: boolean;
  claimed_legacy_data: boolean;
};

export type SaveGameRequest = {
  pgn: string;
  white: string;
  black: string;
  white_elo: string | null;
  black_elo: string | null;
  result: string | null;
  event: string | null;
  date: string | null;
  played_at: string | null;
  eco: string | null;
  opening: string | null;
  time_control: string | null;
  time_class: string | null;
  source_url: string | null;
  source_platform: SyncPlatform | null;
  final_fen: string | null;
  ply_count: number | null;
};

export type GamePreviewUpdate = {
  id: string;
  final_fen: string;
  ply_count: number;
};

export type SaveEngineAnalysisRequest = {
  game_id: string;
  ply: number;
  depth: number;
  result: EngineMoveAnalysis;
  color: "w" | "b";
  phase: Phase;
  quality: MoveQuality;
  centipawn_loss: number;
  think_time_seconds: number | null;
  is_quick: boolean;
  is_time_pressure: boolean;
  tags: string[];
};

export type FetchRecentGamesRequest = {
  platform: SyncPlatform;
  username: string;
  limit: number;
  time_class: string | null;
};

export type ExplainMoveRequest = {
  player_elo: string | null;
  side_just_moved: string;
  side_to_move: string;
  phase: Phase;
  move_number: number;
  played_move: string;
  fen_before: string;
  fen_after: string;
  evaluation: string;
  centipawn_loss: number;
  best_move: string;
  best_line: string[];
  best_reply: string | null;
  reply_line: string[];
};

export type ExplainGameRequest = {
  opening: string;
  result: string;
  total_plies: number;
  white: {
    name: string;
    elo: string | null;
    moves: number;
    acpl: number;
    best_good_rate: number;
    counts: Record<DisplayMoveQuality, number>;
  };
  black: {
    name: string;
    elo: string | null;
    moves: number;
    acpl: number;
    best_good_rate: number;
    counts: Record<DisplayMoveQuality, number>;
  };
  critical_positions: Array<{
    move_number: number;
    side: string;
    played_move: string;
    quality: string;
    centipawn_loss: number;
    evaluation: string;
    best_move: string;
  }>;
};

export type { DashboardMoveRecord };
