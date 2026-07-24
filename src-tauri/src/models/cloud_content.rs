use crate::*;

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudEngineAnalysis {
    pub(crate) game_id: String,
    pub(crate) ply: u32,
    pub(crate) engine_version: String,
    pub(crate) depth: u32,
    pub(crate) multipv: u32,
    pub(crate) result: Value,
    pub(crate) color: String,
    pub(crate) phase: String,
    pub(crate) quality: String,
    pub(crate) centipawn_loss: f64,
    pub(crate) think_time_seconds: Option<f64>,
    pub(crate) is_quick: bool,
    pub(crate) is_time_pressure: bool,
    pub(crate) tags: Vec<String>,
    pub(crate) updated_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudAnalysisManifest {
    pub(crate) game_id: String,
    pub(crate) engine_version: String,
    pub(crate) multipv: u32,
    pub(crate) ply_count: u32,
    pub(crate) completed_at: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudTrainingAttempt {
    pub(crate) cloud_id: String,
    pub(crate) card_id: String,
    pub(crate) game_id: String,
    pub(crate) profile_key: String,
    pub(crate) ply: u32,
    pub(crate) engine_version: String,
    pub(crate) attempted_move: Option<String>,
    pub(crate) result: String,
    pub(crate) centipawn_loss: Option<f64>,
    pub(crate) hints_used: u32,
    pub(crate) failed_attempts: u32,
    pub(crate) duration_ms: Option<u64>,
    pub(crate) attempted_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CloudAiExplanation {
    pub(crate) cache_key: String,
    pub(crate) provider: String,
    pub(crate) model: String,
    pub(crate) prompt_version: String,
    pub(crate) explanation: String,
    pub(crate) created_at: String,
}

macro_rules! cloud_change_types {
    ($remote:ident, $pending:ident, $data:ty) => {
        #[derive(Deserialize)]
        pub(crate) struct $remote {
            pub(crate) document_id: String,
            pub(crate) deleted: bool,
            pub(crate) data: Option<$data>,
        }

        #[derive(Serialize)]
        pub(crate) struct $pending {
            pub(crate) document_id: String,
            pub(crate) generation: i64,
            pub(crate) attempts: i64,
            pub(crate) deleted: bool,
            pub(crate) data: Option<$data>,
        }
    };
}

cloud_change_types!(
    CloudRemoteEngineAnalysisChange,
    CloudPendingEngineAnalysisChange,
    CloudEngineAnalysis
);
cloud_change_types!(
    CloudRemoteAnalysisManifestChange,
    CloudPendingAnalysisManifestChange,
    CloudAnalysisManifest
);
cloud_change_types!(
    CloudRemoteTrainingAttemptChange,
    CloudPendingTrainingAttemptChange,
    CloudTrainingAttempt
);
cloud_change_types!(
    CloudRemoteAiExplanationChange,
    CloudPendingAiExplanationChange,
    CloudAiExplanation
);
