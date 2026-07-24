use crate::*;
use rusqlite::Transaction;

pub(crate) struct CloudContentMergeCounts {
    pub(crate) engine_analyses: usize,
    pub(crate) analysis_manifests: usize,
    pub(crate) training_attempts: usize,
    pub(crate) ai_explanations: usize,
}

fn valid_hex_id(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn valid_engine_analysis(data: &CloudEngineAnalysis, document_id: &str) -> bool {
    validate_game_id(&data.game_id).is_ok()
        && valid_hex_id(document_id)
        && analysis_cloud_id(
            &data.game_id,
            data.ply,
            &data.engine_version,
            data.depth,
            data.multipv,
        ) == document_id
        && data.ply > 0
        && data.ply <= 2_000
        && data.depth > 0
        && data.depth <= 100
        && data.multipv > 0
        && data.multipv <= 10
        && !data.engine_version.is_empty()
        && data.engine_version.len() <= 80
        && matches!(data.color.as_str(), "w" | "b")
        && data.phase.len() <= 80
        && data.quality.len() <= 40
        && data.centipawn_loss.is_finite()
        && data.think_time_seconds.is_none_or(f64::is_finite)
        && data.tags.len() <= 100
        && data.tags.iter().all(|tag| tag.len() <= 80)
        && data.updated_at.len() <= 64
        && serde_json::to_vec(&data.result).is_ok_and(|value| value.len() <= 900_000)
}

fn merge_engine_analyses(
    transaction: &Transaction<'_>,
    changes: &[CloudRemoteEngineAnalysisChange],
    affected_games: &mut Vec<String>,
) -> Result<usize, String> {
    let mut merged = 0;
    for change in changes {
        if !valid_hex_id(&change.document_id) {
            return Err("Mã phân tích cloud không hợp lệ.".to_string());
        }
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'engine_analysis' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận phân tích đã xoá.".to_string())?;
            let game_id = transaction
                .query_row(
                    "SELECT game_id FROM engine_analyses WHERE cloud_id = ?1",
                    params![&change.document_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|_| "Không thể tìm phân tích cần xoá.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM engine_analyses WHERE cloud_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá phân tích cloud.".to_string())?;
            if let Some(game_id) = game_id {
                affected_games.push(game_id);
            }
            continue;
        }
        let data = change
            .data
            .as_ref()
            .ok_or_else(|| "Phân tích cloud bị thiếu dữ liệu.".to_string())?;
        if !valid_engine_analysis(data, &change.document_id) {
            return Err("Dữ liệu phân tích cloud không hợp lệ.".to_string());
        }
        if pending_cloud_operation(transaction, "engine_analysis", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột phân tích.".to_string())?
            .is_some()
        {
            continue;
        }
        let game_exists = transaction
            .query_row(
                "SELECT 1 FROM saved_games WHERE id = ?1",
                params![&data.game_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|_| "Không thể kiểm tra ván của phân tích.".to_string())?
            .is_some();
        if !game_exists {
            continue;
        }
        let result_json = serde_json::to_string(&data.result)
            .map_err(|_| "Không thể mã hoá phân tích cloud.".to_string())?;
        let tags_json = serde_json::to_string(&data.tags)
            .map_err(|_| "Không thể mã hoá nhãn phân tích cloud.".to_string())?;
        merged += transaction
            .execute(
                "INSERT INTO engine_analyses
                 (cloud_id, game_id, ply, engine_version, depth, multipv, result_json,
                  color, phase, quality, centipawn_loss, think_time_seconds, is_quick,
                  is_time_pressure, tags_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                         ?13, ?14, ?15, ?16)
                 ON CONFLICT(game_id, ply, engine_version, depth, multipv) DO UPDATE SET
                   cloud_id = excluded.cloud_id,
                   result_json = excluded.result_json,
                   color = excluded.color,
                   phase = excluded.phase,
                   quality = excluded.quality,
                   centipawn_loss = excluded.centipawn_loss,
                   think_time_seconds = excluded.think_time_seconds,
                   is_quick = excluded.is_quick,
                   is_time_pressure = excluded.is_time_pressure,
                   tags_json = excluded.tags_json,
                   updated_at = excluded.updated_at",
                params![
                    &change.document_id,
                    &data.game_id,
                    data.ply,
                    &data.engine_version,
                    data.depth,
                    data.multipv,
                    result_json,
                    &data.color,
                    &data.phase,
                    &data.quality,
                    data.centipawn_loss,
                    data.think_time_seconds,
                    data.is_quick,
                    data.is_time_pressure,
                    tags_json,
                    &data.updated_at,
                ],
            )
            .map_err(|_| "Không thể nhập phân tích từ cloud.".to_string())?;
        affected_games.push(data.game_id.clone());
    }
    Ok(merged)
}

fn merge_analysis_manifests(
    transaction: &Transaction<'_>,
    changes: &[CloudRemoteAnalysisManifestChange],
    affected_games: &mut Vec<String>,
) -> Result<usize, String> {
    let mut merged = 0;
    for change in changes {
        if !valid_hex_id(&change.document_id) {
            return Err("Mã manifest phân tích không hợp lệ.".to_string());
        }
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'analysis_manifest' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận manifest đã xoá.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM analysis_manifests WHERE cloud_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá manifest phân tích.".to_string())?;
            continue;
        }
        let data = change
            .data
            .as_ref()
            .ok_or_else(|| "Manifest phân tích bị thiếu dữ liệu.".to_string())?;
        if validate_game_id(&data.game_id).is_err()
            || analysis_manifest_cloud_id(&data.game_id, &data.engine_version, data.multipv)
                != change.document_id
            || data.engine_version.is_empty()
            || data.engine_version.len() > 80
            || data.multipv == 0
            || data.multipv > 10
            || data.ply_count == 0
            || data.ply_count > 2_000
            || data.completed_at.len() > 64
            || data.updated_at.len() > 64
        {
            return Err("Dữ liệu manifest phân tích không hợp lệ.".to_string());
        }
        if pending_cloud_operation(transaction, "analysis_manifest", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột manifest.".to_string())?
            .is_some()
        {
            continue;
        }
        let game_exists = transaction
            .query_row(
                "SELECT 1 FROM saved_games WHERE id = ?1",
                params![&data.game_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|_| "Không thể kiểm tra ván của manifest.".to_string())?
            .is_some();
        if !game_exists {
            continue;
        }
        merged += transaction
            .execute(
                "INSERT INTO analysis_manifests
                 (cloud_id, game_id, engine_version, multipv, ply_count, completed_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(game_id, engine_version, multipv) DO UPDATE SET
                   cloud_id = excluded.cloud_id,
                   ply_count = MAX(analysis_manifests.ply_count, excluded.ply_count),
                   completed_at = CASE
                     WHEN excluded.updated_at > analysis_manifests.updated_at
                     THEN excluded.completed_at ELSE analysis_manifests.completed_at END,
                   updated_at = MAX(analysis_manifests.updated_at, excluded.updated_at)",
                params![
                    &change.document_id,
                    &data.game_id,
                    &data.engine_version,
                    data.multipv,
                    data.ply_count,
                    &data.completed_at,
                    &data.updated_at,
                ],
            )
            .map_err(|_| "Không thể nhập manifest phân tích.".to_string())?;
        affected_games.push(data.game_id.clone());
    }
    Ok(merged)
}

pub(crate) fn merge_cloud_content(
    transaction: &Transaction<'_>,
    request: &MergeCloudChangesRequest,
) -> Result<CloudContentMergeCounts, String> {
    let mut affected_games = Vec::new();
    let engine_analyses =
        merge_engine_analyses(transaction, &request.engine_analyses, &mut affected_games)?;
    let analysis_manifests = merge_analysis_manifests(
        transaction,
        &request.analysis_manifests,
        &mut affected_games,
    )?;
    let training_attempts = merge_training_attempts(transaction, &request.training_attempts)?;
    let ai_explanations = merge_ai_explanations(transaction, &request.ai_explanations)?;
    affected_games.sort();
    affected_games.dedup();
    for game_id in affected_games {
        refresh_analysis_completion(transaction, &game_id)
            .map_err(|_| "Không thể cập nhật trạng thái phân tích đã tải.".to_string())?;
    }
    Ok(CloudContentMergeCounts {
        engine_analyses,
        analysis_manifests,
        training_attempts,
        ai_explanations,
    })
}
