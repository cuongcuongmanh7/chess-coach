use crate::*;

#[derive(Default, Deserialize)]
pub(crate) struct MergeCloudChangesRequest {
    pub(crate) profiles: Vec<CloudRemoteProfileChange>,
    pub(crate) games: Vec<CloudRemoteGameChange>,
    pub(crate) training_progress: Vec<CloudRemoteTrainingProgressChange>,
    #[serde(default)]
    pub(crate) engine_analyses: Vec<CloudRemoteEngineAnalysisChange>,
    #[serde(default)]
    pub(crate) analysis_manifests: Vec<CloudRemoteAnalysisManifestChange>,
    #[serde(default)]
    pub(crate) training_attempts: Vec<CloudRemoteTrainingAttemptChange>,
    #[serde(default)]
    pub(crate) ai_explanations: Vec<CloudRemoteAiExplanationChange>,
    #[serde(default)]
    pub(crate) repertoires: Vec<CloudRemoteRepertoireChange>,
    #[serde(default)]
    pub(crate) repertoire_nodes: Vec<CloudRemoteRepertoireNodeChange>,
    #[serde(default)]
    pub(crate) repertoire_progress: Vec<CloudRemoteRepertoireProgressChange>,
}

#[derive(Serialize)]
pub(crate) struct CloudSyncBatch {
    pub(crate) profiles: Vec<CloudPendingProfileChange>,
    pub(crate) games: Vec<CloudPendingGameChange>,
    pub(crate) training_progress: Vec<CloudPendingTrainingProgressChange>,
    pub(crate) engine_analyses: Vec<CloudPendingEngineAnalysisChange>,
    pub(crate) analysis_manifests: Vec<CloudPendingAnalysisManifestChange>,
    pub(crate) training_attempts: Vec<CloudPendingTrainingAttemptChange>,
    pub(crate) ai_explanations: Vec<CloudPendingAiExplanationChange>,
    pub(crate) repertoires: Vec<CloudPendingRepertoireChange>,
    pub(crate) repertoire_nodes: Vec<CloudPendingRepertoireNodeChange>,
    pub(crate) repertoire_progress: Vec<CloudPendingRepertoireProgressChange>,
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
    pub(crate) engine_analyses: CloudSyncCursor,
    pub(crate) analysis_manifests: CloudSyncCursor,
    pub(crate) training_attempts: CloudSyncCursor,
    pub(crate) ai_explanations: CloudSyncCursor,
    pub(crate) repertoires: CloudSyncCursor,
    pub(crate) repertoire_nodes: CloudSyncCursor,
    pub(crate) repertoire_progress: CloudSyncCursor,
}

#[derive(Serialize)]
pub(crate) struct CloudMergeResult {
    pub(crate) profiles_added: usize,
    pub(crate) games_added: usize,
    pub(crate) profiles_deleted: usize,
    pub(crate) games_deleted: usize,
    pub(crate) training_progress_merged: usize,
    pub(crate) engine_analyses_merged: usize,
    pub(crate) analysis_manifests_merged: usize,
    pub(crate) training_attempts_merged: usize,
    pub(crate) ai_explanations_merged: usize,
    pub(crate) repertoires_merged: usize,
    pub(crate) repertoire_nodes_merged: usize,
    pub(crate) repertoire_progress_merged: usize,
}
