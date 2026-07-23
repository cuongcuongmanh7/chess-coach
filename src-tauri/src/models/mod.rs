use crate::*;

pub(crate) mod training;
pub(crate) use training::*;

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct ExplainMoveRequest {
    pub(crate) player_elo: Option<String>,
    pub(crate) side_just_moved: String,
    pub(crate) side_to_move: String,
    pub(crate) phase: String,
    pub(crate) move_number: u32,
    pub(crate) played_move: String,
    pub(crate) fen_before: String,
    pub(crate) fen_after: String,
    pub(crate) evaluation: String,
    pub(crate) centipawn_loss: i32,
    pub(crate) best_move: String,
    pub(crate) best_line: Vec<String>,
    pub(crate) best_reply: Option<String>,
    pub(crate) reply_line: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct SummaryQualityCounts {
    pub(crate) brilliant: u32,
    pub(crate) best: u32,
    pub(crate) good: u32,
    pub(crate) inaccuracy: u32,
    pub(crate) mistake: u32,
    pub(crate) blunder: u32,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct GamePlayerSummary {
    pub(crate) name: String,
    pub(crate) elo: Option<String>,
    pub(crate) moves: u32,
    pub(crate) acpl: i32,
    pub(crate) best_good_rate: i32,
    pub(crate) counts: SummaryQualityCounts,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CriticalPositionSummary {
    pub(crate) move_number: u32,
    pub(crate) side: String,
    pub(crate) played_move: String,
    pub(crate) quality: String,
    pub(crate) centipawn_loss: i32,
    pub(crate) evaluation: String,
    pub(crate) best_move: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct ExplainGameRequest {
    pub(crate) opening: String,
    pub(crate) result: String,
    pub(crate) total_plies: u32,
    pub(crate) white: GamePlayerSummary,
    pub(crate) black: GamePlayerSummary,
    pub(crate) critical_positions: Vec<CriticalPositionSummary>,
}

#[derive(Serialize)]
pub(crate) struct AiExplanation {
    pub(crate) text: String,
    pub(crate) provider: String,
    pub(crate) model: String,
    pub(crate) cached: bool,
}

#[derive(Deserialize)]
pub(crate) struct SaveGameRequest {
    pub(crate) pgn: String,
    pub(crate) white: String,
    pub(crate) black: String,
    pub(crate) white_elo: Option<String>,
    pub(crate) black_elo: Option<String>,
    pub(crate) result: Option<String>,
    pub(crate) event: Option<String>,
    pub(crate) date: Option<String>,
    pub(crate) played_at: Option<String>,
    pub(crate) eco: Option<String>,
    pub(crate) opening: Option<String>,
    pub(crate) time_control: Option<String>,
    pub(crate) time_class: Option<String>,
    pub(crate) source_url: Option<String>,
    pub(crate) source_platform: Option<String>,
    pub(crate) final_fen: Option<String>,
    pub(crate) ply_count: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct GamePreviewUpdate {
    pub(crate) id: String,
    pub(crate) final_fen: String,
    pub(crate) ply_count: i64,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudPlayerProfile {
    pub(crate) platform: String,
    pub(crate) username: String,
    pub(crate) last_sync_at: Option<String>,
    pub(crate) created_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudSavedGame {
    pub(crate) id: String,
    pub(crate) pgn: String,
    pub(crate) white: String,
    pub(crate) black: String,
    pub(crate) white_elo: Option<String>,
    pub(crate) black_elo: Option<String>,
    pub(crate) result: Option<String>,
    pub(crate) event: Option<String>,
    pub(crate) date: Option<String>,
    pub(crate) played_at: Option<String>,
    pub(crate) eco: Option<String>,
    pub(crate) opening: Option<String>,
    pub(crate) time_control: Option<String>,
    pub(crate) time_class: Option<String>,
    pub(crate) source_url: Option<String>,
    pub(crate) source_platform: Option<String>,
    pub(crate) created_at: String,
    pub(crate) last_opened_at: String,
    pub(crate) profile_keys: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct CloudRemoteProfileChange {
    pub(crate) document_id: String,
    pub(crate) deleted: bool,
    pub(crate) needs_upgrade: bool,
    pub(crate) data: Option<CloudPlayerProfile>,
}

#[derive(Deserialize)]
pub(crate) struct CloudRemoteGameChange {
    pub(crate) document_id: String,
    pub(crate) deleted: bool,
    pub(crate) needs_upgrade: bool,
    pub(crate) data: Option<CloudSavedGame>,
}

#[derive(Deserialize)]
pub(crate) struct MergeCloudChangesRequest {
    pub(crate) profiles: Vec<CloudRemoteProfileChange>,
    pub(crate) games: Vec<CloudRemoteGameChange>,
    pub(crate) training_progress: Vec<CloudRemoteTrainingProgressChange>,
}

#[derive(Serialize)]
pub(crate) struct CloudPendingProfileChange {
    pub(crate) document_id: String,
    pub(crate) generation: i64,
    pub(crate) attempts: i64,
    pub(crate) deleted: bool,
    pub(crate) data: Option<CloudPlayerProfile>,
}

#[derive(Serialize)]
pub(crate) struct CloudPendingGameChange {
    pub(crate) document_id: String,
    pub(crate) generation: i64,
    pub(crate) attempts: i64,
    pub(crate) deleted: bool,
    pub(crate) data: Option<CloudSavedGame>,
}

#[derive(Serialize)]
pub(crate) struct CloudSyncBatch {
    pub(crate) profiles: Vec<CloudPendingProfileChange>,
    pub(crate) games: Vec<CloudPendingGameChange>,
    pub(crate) training_progress: Vec<CloudPendingTrainingProgressChange>,
}

#[derive(Clone, Deserialize)]
pub(crate) struct CloudAckToken {
    pub(crate) entity_type: String,
    pub(crate) entity_id: String,
    pub(crate) generation: i64,
}

#[derive(Clone, Deserialize, Serialize, Default)]
pub(crate) struct CloudSyncCursor {
    pub(crate) initialized: bool,
    pub(crate) updated_at_seconds: Option<i64>,
    pub(crate) updated_at_nanoseconds: Option<i64>,
    pub(crate) document_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, Default)]
pub(crate) struct CloudSyncCursors {
    pub(crate) profiles: CloudSyncCursor,
    pub(crate) games: CloudSyncCursor,
    pub(crate) training_progress: CloudSyncCursor,
}

#[derive(Serialize)]
pub(crate) struct CloudMergeResult {
    pub(crate) profiles_added: usize,
    pub(crate) games_added: usize,
    pub(crate) profiles_deleted: usize,
    pub(crate) games_deleted: usize,
    pub(crate) training_progress_merged: usize,
}

#[derive(Serialize)]
pub(crate) struct DatabaseActivationResult {
    pub(crate) changed: bool,
    pub(crate) claimed_legacy_data: bool,
}

#[derive(Serialize)]
pub(crate) struct SavedGameSummary {
    pub(crate) id: String,
    pub(crate) white: String,
    pub(crate) black: String,
    pub(crate) white_elo: Option<String>,
    pub(crate) black_elo: Option<String>,
    pub(crate) result: Option<String>,
    pub(crate) event: Option<String>,
    pub(crate) date: Option<String>,
    pub(crate) played_at: Option<String>,
    pub(crate) eco: Option<String>,
    pub(crate) opening: Option<String>,
    pub(crate) time_control: Option<String>,
    pub(crate) time_class: Option<String>,
    pub(crate) source_url: Option<String>,
    pub(crate) source_platform: Option<String>,
    pub(crate) analysis_complete: bool,
    pub(crate) final_fen: Option<String>,
    pub(crate) ply_count: Option<i64>,
    pub(crate) preview_pgn: Option<String>,
    pub(crate) created_at: String,
    pub(crate) last_opened_at: String,
}

#[derive(Serialize)]
pub(crate) struct SavedGameDetail {
    pub(crate) id: String,
    pub(crate) pgn: String,
}

#[derive(Serialize)]
pub(crate) struct PlayerProfileSummary {
    pub(crate) id: i64,
    pub(crate) platform: String,
    pub(crate) username: String,
    pub(crate) game_count: u32,
    pub(crate) last_sync_at: Option<String>,
    pub(crate) created_at: String,
}

#[derive(Deserialize)]
pub(crate) struct SaveEngineAnalysisRequest {
    pub(crate) game_id: String,
    pub(crate) ply: u32,
    pub(crate) depth: u32,
    pub(crate) result: Value,
    pub(crate) color: String,
    pub(crate) phase: String,
    pub(crate) quality: String,
    pub(crate) centipawn_loss: f64,
    pub(crate) think_time_seconds: Option<f64>,
    pub(crate) is_quick: bool,
    pub(crate) is_time_pressure: bool,
    pub(crate) tags: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct StoredEngineAnalysis {
    pub(crate) ply: u32,
    pub(crate) depth: u32,
    pub(crate) result: Value,
}

#[derive(Serialize)]
pub(crate) struct DashboardMoveRecord {
    pub(crate) game_id: String,
    pub(crate) date: Option<String>,
    pub(crate) eco: Option<String>,
    pub(crate) opening: Option<String>,
    pub(crate) time_control: Option<String>,
    pub(crate) time_class: Option<String>,
    pub(crate) player_color: String,
    pub(crate) phase: String,
    pub(crate) quality: String,
    pub(crate) centipawn_loss: f64,
    pub(crate) think_time_seconds: Option<f64>,
    pub(crate) is_quick: bool,
    pub(crate) is_time_pressure: bool,
    pub(crate) tags: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct FetchRecentGamesRequest {
    pub(crate) platform: String,
    pub(crate) username: String,
    pub(crate) limit: usize,
    pub(crate) time_class: Option<String>,
}
