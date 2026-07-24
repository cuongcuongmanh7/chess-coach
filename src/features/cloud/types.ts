export type CloudPlayerProfile = {
  platform: "chesscom" | "lichess";
  username: string;
  last_sync_at: string | null;
  created_at: string;
  sync_watermark?: string | null;
  sync_gap?: boolean;
};

export type CloudSavedGame = {
  id: string;
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
  source_platform: "chesscom" | "lichess" | null;
  created_at: string;
  last_opened_at: string;
  profile_keys: string[];
};

export type CloudRemoteProfileChange = {
  document_id: string;
  deleted: boolean;
  needs_upgrade: boolean;
  data: CloudPlayerProfile | null;
};

export type CloudRemoteGameChange = {
  document_id: string;
  deleted: boolean;
  needs_upgrade: boolean;
  data: CloudSavedGame | null;
};

export type CloudPendingProfileChange = {
  document_id: string;
  generation: number;
  attempts: number;
  deleted: boolean;
  data: CloudPlayerProfile | null;
};

export type CloudPendingGameChange = {
  document_id: string;
  generation: number;
  attempts: number;
  deleted: boolean;
  data: CloudSavedGame | null;
};

export type CloudTrainingProgress = {
  card_id: string;
  status: string;
  due_at: string;
  interval_days: number;
  correct_streak: number;
  attempts: number;
  lapses: number;
  starred: boolean;
  suspended: boolean;
  last_correct_at: string | null;
  updated_at: string;
};

export type CloudRemoteTrainingProgressChange = {
  document_id: string;
  deleted: boolean;
  needs_upgrade: boolean;
  data: CloudTrainingProgress | null;
};

export type CloudPendingTrainingProgressChange = {
  document_id: string;
  generation: number;
  attempts: number;
  deleted: boolean;
  data: CloudTrainingProgress | null;
};

export type CloudSyncBatch = {
  profiles: CloudPendingProfileChange[];
  games: CloudPendingGameChange[];
  training_progress: CloudPendingTrainingProgressChange[];
  engine_analyses: CloudPendingEngineAnalysisChange[];
  analysis_manifests: CloudPendingAnalysisManifestChange[];
  training_attempts: CloudPendingTrainingAttemptChange[];
  ai_explanations: CloudPendingAiExplanationChange[];
};

export type CloudEngineAnalysis = {
  game_id: string;
  ply: number;
  engine_version: string;
  depth: number;
  multipv: number;
  result: unknown;
  color: string;
  phase: string;
  quality: string;
  centipawn_loss: number;
  think_time_seconds: number | null;
  is_quick: boolean;
  is_time_pressure: boolean;
  tags: string[];
  updated_at: string;
};

export type CloudAnalysisManifest = {
  game_id: string;
  engine_version: string;
  multipv: number;
  ply_count: number;
  completed_at: string;
  updated_at: string;
};

export type CloudTrainingAttempt = {
  cloud_id: string;
  card_id: string;
  game_id: string;
  profile_key: string;
  ply: number;
  engine_version: string;
  attempted_move: string | null;
  result: string;
  centipawn_loss: number | null;
  hints_used: number;
  failed_attempts: number;
  duration_ms: number | null;
  attempted_at: string;
};

export type CloudAiExplanation = {
  cache_key: string;
  provider: string;
  model: string;
  prompt_version: string;
  explanation: string;
  created_at: string;
};

export type CloudPendingContentChange<T> = {
  document_id: string;
  generation: number;
  attempts: number;
  deleted: boolean;
  data: T | null;
};

export type CloudRemoteContentChange<T> = {
  document_id: string;
  deleted: boolean;
  needs_upgrade: boolean;
  data: T | null;
};

export type CloudPendingEngineAnalysisChange = CloudPendingContentChange<CloudEngineAnalysis>;
export type CloudPendingAnalysisManifestChange = CloudPendingContentChange<CloudAnalysisManifest>;
export type CloudPendingTrainingAttemptChange = CloudPendingContentChange<CloudTrainingAttempt>;
export type CloudPendingAiExplanationChange = CloudPendingContentChange<CloudAiExplanation>;
export type CloudRemoteEngineAnalysisChange = CloudRemoteContentChange<CloudEngineAnalysis>;
export type CloudRemoteAnalysisManifestChange = CloudRemoteContentChange<CloudAnalysisManifest>;
export type CloudRemoteTrainingAttemptChange = CloudRemoteContentChange<CloudTrainingAttempt>;
export type CloudRemoteAiExplanationChange = CloudRemoteContentChange<CloudAiExplanation>;

export type CloudSyncCursor = {
  initialized: boolean;
  updated_at_seconds: number | null;
  updated_at_nanoseconds: number | null;
  document_id: string | null;
};

export type CloudSyncCursors = {
  profiles: CloudSyncCursor;
  games: CloudSyncCursor;
  training_progress: CloudSyncCursor;
  engine_analyses: CloudSyncCursor;
  analysis_manifests: CloudSyncCursor;
  training_attempts: CloudSyncCursor;
  ai_explanations: CloudSyncCursor;
};

export type CloudDownloadResult = {
  changes: {
    profiles: CloudRemoteProfileChange[];
    games: CloudRemoteGameChange[];
    training_progress: CloudRemoteTrainingProgressChange[];
    engine_analyses: CloudRemoteEngineAnalysisChange[];
    analysis_manifests: CloudRemoteAnalysisManifestChange[];
    training_attempts: CloudRemoteTrainingAttemptChange[];
    ai_explanations: CloudRemoteAiExplanationChange[];
  };
  cursors: CloudSyncCursors;
};
