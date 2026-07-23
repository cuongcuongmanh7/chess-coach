export type CloudPlayerProfile = {
  platform: "chesscom" | "lichess";
  username: string;
  last_sync_at: string | null;
  created_at: string;
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
  starred: boolean;
  suspended: boolean;
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
};

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
};

export type CloudDownloadResult = {
  changes: {
    profiles: CloudRemoteProfileChange[];
    games: CloudRemoteGameChange[];
    training_progress: CloudRemoteTrainingProgressChange[];
  };
  cursors: CloudSyncCursors;
};
