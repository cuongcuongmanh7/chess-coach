use crate::*;

#[derive(Clone, Deserialize)]
pub(crate) struct RepertoireNodeSeed {
    // Khóa ổn định do client tính (position_key|move_uci), độc lập với repertoire_id.
    pub(crate) node_key: String,
    pub(crate) parent_key: Option<String>,
    pub(crate) position_key: String,
    pub(crate) fen: String,
    pub(crate) move_san: String,
    pub(crate) move_uci: String,
    pub(crate) side_to_move: String,
    pub(crate) is_user_move: bool,
    pub(crate) source: String,
    #[serde(default)]
    pub(crate) frequency: i64,
    #[serde(default)]
    pub(crate) avg_cpl: Option<f64>,
    #[serde(default)]
    pub(crate) comment: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SaveRepertoireRequest {
    pub(crate) profile_id: i64,
    pub(crate) color: String,
    pub(crate) name: String,
    pub(crate) eco: Option<String>,
    pub(crate) nodes: Vec<RepertoireNodeSeed>,
}

#[derive(Serialize)]
pub(crate) struct SaveRepertoireResult {
    pub(crate) repertoire_id: String,
    pub(crate) node_count: usize,
}

#[derive(Serialize)]
pub(crate) struct Repertoire {
    pub(crate) id: String,
    pub(crate) profile_id: i64,
    pub(crate) color: String,
    pub(crate) name: String,
    pub(crate) eco: Option<String>,
    pub(crate) source: String,
    pub(crate) node_count: i64,
    pub(crate) due_count: i64,
    pub(crate) new_count: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Serialize)]
pub(crate) struct RepertoireNode {
    pub(crate) id: String,
    pub(crate) repertoire_id: String,
    pub(crate) parent_id: Option<String>,
    pub(crate) position_key: String,
    pub(crate) fen: String,
    pub(crate) move_san: String,
    pub(crate) move_uci: String,
    pub(crate) side_to_move: String,
    pub(crate) is_user_move: bool,
    pub(crate) source: String,
    pub(crate) frequency: i64,
    pub(crate) avg_cpl: Option<f64>,
    pub(crate) comment: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) due_at: Option<String>,
    pub(crate) interval_days: i64,
    pub(crate) correct_count: i64,
    pub(crate) wrong_count: i64,
    pub(crate) correct_streak: i64,
}

#[derive(Serialize)]
pub(crate) struct RepertoireProgress {
    pub(crate) node_id: String,
    pub(crate) correct_count: i64,
    pub(crate) wrong_count: i64,
    pub(crate) correct_streak: i64,
    pub(crate) status: String,
    pub(crate) interval_days: i64,
    pub(crate) due_at: String,
    pub(crate) last_correct_at: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct ReviewRepertoireNodeRequest {
    pub(crate) node_id: String,
    pub(crate) profile_id: i64,
    pub(crate) correct: bool,
    #[serde(default)]
    pub(crate) hints_used: u32,
    #[serde(default)]
    pub(crate) failed_attempts: u32,
    #[serde(default)]
    pub(crate) duration_ms: u64,
    #[serde(default)]
    pub(crate) centipawn_loss: f64,
}

#[derive(Deserialize)]
pub(crate) struct AddRepertoireMoveRequest {
    pub(crate) repertoire_id: String,
    pub(crate) parent_id: Option<String>,
    pub(crate) position_key: String,
    pub(crate) fen: String,
    pub(crate) move_san: String,
    pub(crate) move_uci: String,
    pub(crate) side_to_move: String,
    #[serde(default)]
    pub(crate) comment: Option<String>,
}
