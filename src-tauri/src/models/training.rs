use crate::*;

#[derive(Clone, Deserialize)]
pub(crate) struct TrainingCardSeed {
    pub(crate) ply: u32,
    pub(crate) fen: String,
    pub(crate) side_to_move: String,
    pub(crate) played_move: String,
    pub(crate) best_move: String,
    pub(crate) best_line: Vec<String>,
    pub(crate) quality: String,
    pub(crate) centipawn_loss: f64,
    pub(crate) phase: String,
    pub(crate) tags: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct GenerateTrainingCardsRequest {
    pub(crate) game_id: String,
    pub(crate) profile_id: i64,
    pub(crate) include_inaccuracies: bool,
    pub(crate) cards: Vec<TrainingCardSeed>,
}

#[derive(Serialize)]
pub(crate) struct GenerateTrainingCardsResult {
    pub(crate) created: usize,
    pub(crate) eligible: usize,
}

#[derive(Deserialize)]
pub(crate) struct ListTrainingCardsRequest {
    pub(crate) profile_id: i64,
    pub(crate) queue: Option<String>,
}

#[derive(Clone, Serialize)]
pub(crate) struct TrainingCard {
    pub(crate) id: String,
    pub(crate) profile_id: i64,
    pub(crate) game_id: String,
    pub(crate) ply: u32,
    pub(crate) fen: String,
    pub(crate) side_to_move: String,
    pub(crate) played_move: String,
    pub(crate) best_move: String,
    pub(crate) best_line: Vec<String>,
    pub(crate) quality: String,
    pub(crate) centipawn_loss: f64,
    pub(crate) phase: String,
    pub(crate) opening: Option<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) status: String,
    pub(crate) due_at: String,
    pub(crate) interval_days: u32,
    pub(crate) correct_streak: u32,
    pub(crate) attempts: u32,
    pub(crate) lapses: u32,
    pub(crate) starred: bool,
    pub(crate) suspended: bool,
    pub(crate) last_correct_at: Option<String>,
    pub(crate) time_class: Option<String>,
    pub(crate) game_date: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct ReviewTrainingCardRequest {
    pub(crate) card_id: String,
    pub(crate) attempted_move: Option<String>,
    pub(crate) centipawn_loss: f64,
    pub(crate) hints_used: u32,
    pub(crate) failed_attempts: u32,
    pub(crate) duration_ms: u64,
}

#[derive(Deserialize)]
pub(crate) struct UpdateTrainingCardRequest {
    pub(crate) card_id: String,
    pub(crate) starred: Option<bool>,
    pub(crate) suspended: Option<bool>,
}

#[derive(Serialize)]
pub(crate) struct TrainingStats {
    pub(crate) total: u32,
    pub(crate) due: u32,
    pub(crate) new_cards: u32,
    pub(crate) mastered: u32,
    pub(crate) attempts: u32,
    pub(crate) first_try_correct_rate: f64,
    pub(crate) average_hints: f64,
    pub(crate) streak_days: u32,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudTrainingProgress {
    pub(crate) card_id: String,
    pub(crate) status: String,
    pub(crate) due_at: String,
    pub(crate) interval_days: u32,
    pub(crate) correct_streak: u32,
    pub(crate) attempts: u32,
    #[serde(default)]
    pub(crate) lapses: u32,
    pub(crate) starred: bool,
    pub(crate) suspended: bool,
    #[serde(default)]
    pub(crate) last_correct_at: Option<String>,
    pub(crate) updated_at: String,
}

#[derive(Deserialize)]
pub(crate) struct CloudRemoteTrainingProgressChange {
    pub(crate) document_id: String,
    pub(crate) deleted: bool,
    pub(crate) data: Option<CloudTrainingProgress>,
}

#[derive(Serialize)]
pub(crate) struct CloudPendingTrainingProgressChange {
    pub(crate) document_id: String,
    pub(crate) generation: i64,
    pub(crate) attempts: i64,
    pub(crate) deleted: bool,
    pub(crate) data: Option<CloudTrainingProgress>,
}
