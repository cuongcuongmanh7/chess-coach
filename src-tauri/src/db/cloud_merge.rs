use crate::*;

pub(crate) fn merge_cloud_changes_connection(
    connection: &mut Connection,
    request: MergeCloudChangesRequest,
) -> Result<CloudMergeResult, String> {
    if request.profiles.len() > 1_000
        || request.games.len() > 10_000
        || request.training_progress.len() > 50_000
        || request.engine_analyses.len() > 500_000
        || request.analysis_manifests.len() > 10_000
        || request.training_attempts.len() > 200_000
        || request.ai_explanations.len() > 100_000
    {
        return Err("Bản đồng bộ vượt quá giới hạn an toàn.".to_string());
    }

    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu hợp nhất dữ liệu cloud.".to_string())?;
    let mut profiles_added = 0usize;
    let mut games_added = 0usize;
    let mut profiles_deleted = 0usize;
    let mut games_deleted = 0usize;

    for change in &request.profiles {
        if !valid_cloud_document_id(&change.document_id) {
            return Err("Mã hồ sơ cloud không hợp lệ.".to_string());
        }
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'profile' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận hồ sơ đã xoá trên cloud.".to_string())?;
            let profile_id: Option<i64> = transaction
                .query_row(
                    "SELECT id FROM player_profiles
                     WHERE platform || '_' || lower(username) = ?1",
                    params![&change.document_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|_| "Không thể tìm hồ sơ cần xoá từ cloud.".to_string())?;
            if let Some(profile_id) = profile_id {
                remove_training_for_profile(&transaction, profile_id, false)?;
                transaction
                    .execute(
                        "DELETE FROM game_profiles WHERE profile_id = ?1",
                        params![profile_id],
                    )
                    .map_err(|_| "Không thể xoá liên kết hồ sơ từ cloud.".to_string())?;
                profiles_deleted += transaction
                    .execute(
                        "DELETE FROM player_profiles WHERE id = ?1",
                        params![profile_id],
                    )
                    .map_err(|_| "Không thể xoá hồ sơ từ cloud.".to_string())?;
            }
            continue;
        }

        let profile = change
            .data
            .as_ref()
            .ok_or_else(|| "Hồ sơ cloud bị thiếu dữ liệu.".to_string())?;
        let platform = normalized_platform(Some(profile.platform.as_str()))
            .ok_or_else(|| "Nền tảng hồ sơ cloud không hợp lệ.".to_string())?;
        let username = profile.username.trim();
        if !valid_username(username) || profile_cloud_key(platform, username) != change.document_id
        {
            return Err("Username hoặc mã hồ sơ cloud không hợp lệ.".to_string());
        }
        if pending_cloud_operation(&transaction, "profile", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột hồ sơ local.".to_string())?
            .is_some()
        {
            continue;
        }
        profiles_added += transaction
            .execute(
                "INSERT OR IGNORE INTO player_profiles
                 (platform, username, last_sync_at, created_at, sync_watermark, sync_gap)
                 VALUES (?1, ?2, ?3, COALESCE(NULLIF(?4, ''), datetime('now')), ?5, ?6)",
                params![
                    platform,
                    username,
                    &profile.last_sync_at,
                    &profile.created_at,
                    &profile.sync_watermark,
                    profile.sync_gap as i64
                ],
            )
            .map_err(|_| "Không thể nhập hồ sơ từ cloud.".to_string())?;
        transaction
            .execute(
                "UPDATE player_profiles
                 SET last_sync_at = CASE
                       WHEN ?3 IS NOT NULL AND (last_sync_at IS NULL OR ?3 > last_sync_at) THEN ?3
                       ELSE last_sync_at
                     END,
                     sync_gap = CASE
                       WHEN sync_gap = 1 OR ?5 = 1
                         OR (sync_watermark IS NOT NULL AND ?4 IS NOT NULL AND sync_watermark <> ?4)
                       THEN 1 ELSE sync_gap
                     END,
                     sync_watermark = CASE
                       WHEN sync_watermark IS NULL THEN ?4
                       WHEN ?4 IS NULL THEN sync_watermark
                       WHEN ?4 < sync_watermark THEN ?4
                       ELSE sync_watermark
                     END
                 WHERE platform = ?1 AND username = ?2 COLLATE NOCASE",
                params![platform, username, &profile.last_sync_at, &profile.sync_watermark, profile.sync_gap as i64],
            )
            .map_err(|_| "Không thể cập nhật hồ sơ từ cloud.".to_string())?;
        if change.needs_upgrade {
            queue_cloud_change(&transaction, "profile", &change.document_id, "upsert")
                .map_err(|_| "Không thể nâng cấp hồ sơ cloud cũ.".to_string())?;
        }
    }

    for change in &request.games {
        validate_game_id(&change.document_id)?;
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'game' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận ván đã xoá trên cloud.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE (entity_type = 'engine_analysis' AND entity_id IN (
                       SELECT cloud_id FROM engine_analyses WHERE game_id = ?1
                     )) OR (entity_type = 'analysis_manifest' AND entity_id IN (
                       SELECT cloud_id FROM analysis_manifests WHERE game_id = ?1
                     ))",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể dọn hàng đợi phân tích của ván.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM engine_analyses WHERE game_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá phân tích của ván từ cloud.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM analysis_manifests WHERE game_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá manifest phân tích của ván.".to_string())?;
            remove_training_for_game(&transaction, &change.document_id, false)?;
            transaction
                .execute(
                    "DELETE FROM game_profiles WHERE game_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá liên kết ván từ cloud.".to_string())?;
            games_deleted += transaction
                .execute(
                    "DELETE FROM saved_games WHERE id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá ván từ cloud.".to_string())?;
            continue;
        }

        let game = change
            .data
            .as_ref()
            .ok_or_else(|| "Ván cloud bị thiếu dữ liệu.".to_string())?;
        if game.id != change.document_id {
            return Err("Mã tài liệu cloud không khớp mã ván.".to_string());
        }
        validate_game_id(&game.id)?;
        let normalized_pgn = game.pgn.trim().replace("\r\n", "\n");
        if normalized_pgn.is_empty() || normalized_pgn.len() > 900_000 {
            return Err("PGN trên cloud không hợp lệ hoặc quá lớn.".to_string());
        }
        let mut hasher = Sha256::new();
        hasher.update(normalized_pgn.as_bytes());
        if format!("{:x}", hasher.finalize()) != game.id {
            return Err("Mã ván trên cloud không khớp nội dung PGN.".to_string());
        }
        if pending_cloud_operation(&transaction, "game", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột ván local.".to_string())?
            .is_some()
        {
            continue;
        }
        let source_platform = normalized_platform(game.source_platform.as_deref());
        let existed = transaction
            .query_row(
                "SELECT 1 FROM saved_games WHERE id = ?1",
                params![&game.id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|_| "Không thể kiểm tra ván local.".to_string())?
            .is_some();
        transaction
            .execute(
                "INSERT INTO saved_games
                 (id, pgn, white, black, white_elo, black_elo, result, event, game_date,
                  played_at, eco, opening, time_control, time_class, source_url,
                  source_platform, analysis_complete, created_at, last_opened_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                         ?14, ?15, ?16, 0, COALESCE(NULLIF(?17, ''), datetime('now')),
                         COALESCE(NULLIF(?18, ''), datetime('now')))
                 ON CONFLICT(id) DO UPDATE SET
                   pgn = excluded.pgn,
                   white = excluded.white,
                   black = excluded.black,
                   white_elo = excluded.white_elo,
                   black_elo = excluded.black_elo,
                   result = excluded.result,
                   event = excluded.event,
                   game_date = excluded.game_date,
                   played_at = excluded.played_at,
                   eco = excluded.eco,
                   opening = excluded.opening,
                   time_control = excluded.time_control,
                   time_class = excluded.time_class,
                   source_url = excluded.source_url,
                   source_platform = excluded.source_platform,
                   created_at = MIN(saved_games.created_at, excluded.created_at),
                   last_opened_at = MAX(saved_games.last_opened_at, excluded.last_opened_at)",
                params![
                    &game.id,
                    &normalized_pgn,
                    &game.white,
                    &game.black,
                    &game.white_elo,
                    &game.black_elo,
                    &game.result,
                    &game.event,
                    &game.date,
                    &game.played_at,
                    &game.eco,
                    &game.opening,
                    &game.time_control,
                    &game.time_class,
                    &game.source_url,
                    source_platform,
                    &game.created_at,
                    &game.last_opened_at,
                ],
            )
            .map_err(|_| "Không thể nhập ván từ cloud.".to_string())?;
        if !existed {
            games_added += 1;
        }
        transaction
            .execute(
                "DELETE FROM game_profiles WHERE game_id = ?1",
                params![&game.id],
            )
            .map_err(|_| "Không thể cập nhật liên kết ván cloud.".to_string())?;
        for profile_key in &game.profile_keys {
            let Some((platform_value, username_value)) = profile_key.split_once(':') else {
                continue;
            };
            let Some(platform) = normalized_platform(Some(platform_value)) else {
                continue;
            };
            if !valid_username(username_value) {
                continue;
            }
            transaction
                .execute(
                    "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
                     SELECT ?1, pp.id,
                            CASE WHEN lower(?2) = lower(?4) THEN 'w' ELSE 'b' END,
                            datetime('now')
                     FROM player_profiles pp
                     WHERE pp.platform = ?3 AND pp.username = ?2 COLLATE NOCASE
                       AND (lower(?2) = lower(?4) OR lower(?2) = lower(?5))",
                    params![&game.id, username_value, platform, &game.white, &game.black],
                )
                .map_err(|_| "Không thể liên kết ván cloud với hồ sơ.".to_string())?;
        }
        if game.profile_keys.is_empty() {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
                     SELECT ?1, pp.id,
                            CASE WHEN lower(?2) = lower(pp.username) THEN 'w' ELSE 'b' END,
                            datetime('now')
                     FROM player_profiles pp
                     WHERE (lower(?2) = lower(pp.username) OR lower(?3) = lower(pp.username))
                       AND (?4 IS NULL OR pp.platform = ?4)",
                    params![&game.id, &game.white, &game.black, source_platform],
                )
                .map_err(|_| "Không thể suy ra liên kết hồ sơ cho ván cloud cũ.".to_string())?;
        }
        if change.needs_upgrade {
            queue_cloud_change(&transaction, "game", &change.document_id, "upsert")
                .map_err(|_| "Không thể nâng cấp ván cloud cũ.".to_string())?;
        }
    }

    let training_progress_merged =
        merge_training_progress(&transaction, &request.training_progress)?;
    let content = merge_cloud_content(&transaction, &request)?;

    transaction
        .commit()
        .map_err(|_| "Không thể lưu dữ liệu cloud đã hợp nhất.".to_string())?;
    Ok(CloudMergeResult {
        profiles_added,
        games_added,
        profiles_deleted,
        games_deleted,
        training_progress_merged,
        engine_analyses_merged: content.engine_analyses,
        analysis_manifests_merged: content.analysis_manifests,
        training_attempts_merged: content.training_attempts,
        ai_explanations_merged: content.ai_explanations,
    })
}

pub(crate) fn merge_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
    request: MergeCloudChangesRequest,
) -> Result<CloudMergeResult, String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở dữ liệu để hợp nhất.".to_string())?;
    merge_cloud_changes_connection(&mut connection, request)
}
