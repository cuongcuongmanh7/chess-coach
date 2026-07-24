use crate::*;

fn cloud_engine_analysis(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudEngineAnalysis>> {
    connection
        .query_row(
            "SELECT game_id, ply, engine_version, depth, multipv, result_json, color,
                    phase, quality, centipawn_loss, think_time_seconds, is_quick,
                    is_time_pressure, tags_json, updated_at
             FROM engine_analyses WHERE cloud_id = ?1",
            params![document_id],
            |row| {
                let result_json: String = row.get(5)?;
                let tags_json: String = row.get(13)?;
                Ok(CloudEngineAnalysis {
                    game_id: row.get(0)?,
                    ply: row.get(1)?,
                    engine_version: row.get(2)?,
                    depth: row.get(3)?,
                    multipv: row.get(4)?,
                    result: serde_json::from_str(&result_json).unwrap_or(Value::Null),
                    color: row.get(6)?,
                    phase: row.get(7)?,
                    quality: row.get(8)?,
                    centipawn_loss: row.get(9)?,
                    think_time_seconds: row.get(10)?,
                    is_quick: row.get::<_, i64>(11)? != 0,
                    is_time_pressure: row.get::<_, i64>(12)? != 0,
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    updated_at: row.get(14)?,
                })
            },
        )
        .optional()
}

fn cloud_analysis_manifest(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudAnalysisManifest>> {
    connection
        .query_row(
            "SELECT game_id, engine_version, multipv, ply_count, completed_at, updated_at
             FROM analysis_manifests WHERE cloud_id = ?1",
            params![document_id],
            |row| {
                Ok(CloudAnalysisManifest {
                    game_id: row.get(0)?,
                    engine_version: row.get(1)?,
                    multipv: row.get(2)?,
                    ply_count: row.get(3)?,
                    completed_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .optional()
}

fn cloud_training_attempt(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudTrainingAttempt>> {
    connection
        .query_row(
            "SELECT ta.cloud_id, ta.card_id, tc.game_id,
                    pp.platform || ':' || lower(pp.username), tc.ply, tc.engine_version,
                    ta.attempted_move, ta.result, ta.centipawn_loss, ta.hints_used,
                    ta.failed_attempts, ta.duration_ms, ta.attempted_at
             FROM training_attempts ta
             JOIN training_cards tc ON tc.id = ta.card_id
             JOIN player_profiles pp ON pp.id = tc.profile_id
             WHERE ta.cloud_id = ?1",
            params![document_id],
            |row| {
                Ok(CloudTrainingAttempt {
                    cloud_id: row.get(0)?,
                    card_id: row.get(1)?,
                    game_id: row.get(2)?,
                    profile_key: row.get(3)?,
                    ply: row.get(4)?,
                    engine_version: row.get(5)?,
                    attempted_move: row.get(6)?,
                    result: row.get(7)?,
                    centipawn_loss: row.get(8)?,
                    hints_used: row.get(9)?,
                    failed_attempts: row.get(10)?,
                    duration_ms: row.get(11)?,
                    attempted_at: row.get(12)?,
                })
            },
        )
        .optional()
}

fn cloud_ai_explanation(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudAiExplanation>> {
    connection
        .query_row(
            "SELECT cache_key, provider, model, prompt_version, explanation, created_at
             FROM ai_explanations WHERE cache_key = ?1",
            params![document_id],
            |row| {
                Ok(CloudAiExplanation {
                    cache_key: row.get(0)?,
                    provider: row.get(1)?,
                    model: row.get(2)?,
                    prompt_version: row.get(3)?,
                    explanation: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .optional()
}

pub(crate) fn export_engine_analyses(
    connection: &Connection,
) -> Result<Vec<CloudPendingEngineAnalysisChange>, String> {
    pending_rows(connection, "engine_analysis")?
        .into_iter()
        .map(|(document_id, generation, attempts, operation)| {
            let deleted = operation == "delete";
            let data = if deleted {
                None
            } else {
                cloud_engine_analysis(connection, &document_id)
                    .map_err(|_| "Không thể đọc phân tích đang chờ đồng bộ.".to_string())?
            };
            if !deleted && data.is_none() {
                return Err("Phân tích trong hàng đợi cloud không còn tồn tại.".to_string());
            }
            Ok(CloudPendingEngineAnalysisChange {
                document_id,
                generation,
                attempts,
                deleted,
                data,
            })
        })
        .collect()
}

pub(crate) fn export_analysis_manifests(
    connection: &Connection,
) -> Result<Vec<CloudPendingAnalysisManifestChange>, String> {
    pending_rows(connection, "analysis_manifest")?
        .into_iter()
        .map(|(document_id, generation, attempts, operation)| {
            let deleted = operation == "delete";
            let data = if deleted {
                None
            } else {
                cloud_analysis_manifest(connection, &document_id)
                    .map_err(|_| "Không thể đọc manifest phân tích.".to_string())?
            };
            if !deleted && data.is_none() {
                return Err("Manifest phân tích trong hàng đợi không còn tồn tại.".to_string());
            }
            Ok(CloudPendingAnalysisManifestChange {
                document_id,
                generation,
                attempts,
                deleted,
                data,
            })
        })
        .collect()
}

pub(crate) fn export_training_attempts(
    connection: &Connection,
) -> Result<Vec<CloudPendingTrainingAttemptChange>, String> {
    pending_rows(connection, "training_attempt")?
        .into_iter()
        .map(|(document_id, generation, attempts, operation)| {
            let deleted = operation == "delete";
            let data = if deleted {
                None
            } else {
                cloud_training_attempt(connection, &document_id)
                    .map_err(|_| "Không thể đọc lịch sử luyện đang chờ.".to_string())?
            };
            if !deleted && data.is_none() {
                return Err("Lịch sử luyện trong hàng đợi không còn tồn tại.".to_string());
            }
            Ok(CloudPendingTrainingAttemptChange {
                document_id,
                generation,
                attempts,
                deleted,
                data,
            })
        })
        .collect()
}

pub(crate) fn export_ai_explanations(
    connection: &Connection,
) -> Result<Vec<CloudPendingAiExplanationChange>, String> {
    pending_rows(connection, "ai_explanation")?
        .into_iter()
        .map(|(document_id, generation, attempts, operation)| {
            let deleted = operation == "delete";
            let data = if deleted {
                None
            } else {
                cloud_ai_explanation(connection, &document_id)
                    .map_err(|_| "Không thể đọc cache HLV AI đang chờ.".to_string())?
            };
            if !deleted && data.is_none() {
                return Err("Cache HLV AI trong hàng đợi không còn tồn tại.".to_string());
            }
            Ok(CloudPendingAiExplanationChange {
                document_id,
                generation,
                attempts,
                deleted,
                data,
            })
        })
        .collect()
}
