use crate::*;

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudRepertoire {
    pub(crate) cloud_id: String,
    pub(crate) profile_key: String,
    pub(crate) color: String,
    pub(crate) name: String,
    pub(crate) eco: Option<String>,
    pub(crate) source: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudRepertoireNode {
    pub(crate) cloud_id: String,
    pub(crate) repertoire_cloud_id: String,
    pub(crate) node_key: String,
    // Khóa của node cha, không phải id local: nhờ vậy merge dựng được parent_id
    // bằng phép derive mà không cần row cha đã tồn tại.
    pub(crate) parent_node_key: Option<String>,
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
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudRepertoireProgress {
    pub(crate) node_cloud_id: String,
    pub(crate) repertoire_cloud_id: String,
    pub(crate) profile_key: String,
    pub(crate) correct_count: i64,
    pub(crate) wrong_count: i64,
    pub(crate) correct_streak: i64,
    pub(crate) status: String,
    pub(crate) interval_days: i64,
    pub(crate) due_at: String,
    pub(crate) last_correct_at: Option<String>,
    pub(crate) updated_at: String,
}

cloud_change_types!(
    CloudRemoteRepertoireChange,
    CloudPendingRepertoireChange,
    CloudRepertoire
);
cloud_change_types!(
    CloudRemoteRepertoireNodeChange,
    CloudPendingRepertoireNodeChange,
    CloudRepertoireNode
);
cloud_change_types!(
    CloudRemoteRepertoireProgressChange,
    CloudPendingRepertoireProgressChange,
    CloudRepertoireProgress
);
