use crate::*;

pub(crate) fn profile_cloud_key(platform: &str, username: &str) -> String {
    format!("{platform}_{}", username.trim().to_ascii_lowercase())
}

pub(crate) fn queue_cloud_change(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    operation: &str,
) -> rusqlite::Result<()> {
    connection.execute(
        "INSERT INTO cloud_sync_queue
         (entity_type, entity_id, operation, generation, attempts, next_retry_at, last_error, updated_at)
         VALUES (?1, ?2, ?3, 1, 0, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           operation = excluded.operation,
           generation = cloud_sync_queue.generation + 1,
           attempts = 0,
           next_retry_at = NULL,
           last_error = NULL,
           updated_at = excluded.updated_at",
        params![entity_type, entity_id, operation],
    )?;
    Ok(())
}

pub(crate) fn pending_cloud_operation(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> rusqlite::Result<Option<String>> {
    connection
        .query_row(
            "SELECT operation FROM cloud_sync_queue
             WHERE entity_type = ?1 AND entity_id = ?2",
            params![entity_type, entity_id],
            |row| row.get(0),
        )
        .optional()
}

pub(crate) fn queue_games_for_profile(
    connection: &Connection,
    profile_id: i64,
) -> rusqlite::Result<()> {
    let game_ids = {
        let mut statement =
            connection.prepare("SELECT game_id FROM game_profiles WHERE profile_id = ?1")?;
        let rows = statement
            .query_map(params![profile_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for game_id in game_ids {
        queue_cloud_change(connection, "game", &game_id, "upsert")?;
    }
    Ok(())
}

pub(crate) fn save_game(
    database: tauri::State<'_, DatabaseState>,
    request: SaveGameRequest,
) -> Result<String, String> {
    let normalized_pgn = request.pgn.trim().replace("\r\n", "\n");
    if normalized_pgn.is_empty() {
        return Err("Không thể lưu ván cờ trống.".to_string());
    }
    let mut hasher = Sha256::new();
    hasher.update(normalized_pgn.as_bytes());
    let id = format!("{:x}", hasher.finalize());
    let played_at = request
        .played_at
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| played_at_from_pgn(&normalized_pgn));
    let source_platform = normalized_platform(request.source_platform.as_deref())
        .map(str::to_string)
        .or_else(|| {
            request.source_url.as_deref().and_then(|url| {
                if url.contains("lichess.org") {
                    Some("lichess".to_string())
                } else if url.contains("chess.com") {
                    Some("chesscom".to_string())
                } else {
                    None
                }
            })
        });
    if request.ply_count.is_some_and(|count| count <= 0) {
        return Err("Số nước đi của ván cờ không hợp lệ.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    connection
        .execute(
            "INSERT INTO saved_games
             (id, pgn, white, black, white_elo, black_elo, result, event, game_date, played_at,
              eco, opening, time_control, time_class, source_url, source_platform, final_fen,
              ply_count, created_at, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                     ?17, ?18, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               pgn = excluded.pgn,
               white = excluded.white,
               black = excluded.black,
               white_elo = excluded.white_elo,
               black_elo = excluded.black_elo,
               result = excluded.result,
               event = excluded.event,
               game_date = excluded.game_date,
               played_at = COALESCE(excluded.played_at, saved_games.played_at),
               eco = excluded.eco,
               opening = excluded.opening,
               time_control = excluded.time_control,
               time_class = excluded.time_class,
               source_url = COALESCE(excluded.source_url, saved_games.source_url),
               source_platform = COALESCE(excluded.source_platform, saved_games.source_platform),
               final_fen = COALESCE(excluded.final_fen, saved_games.final_fen),
               ply_count = COALESCE(excluded.ply_count, saved_games.ply_count),
               last_opened_at = datetime('now')",
            params![
                &id,
                &normalized_pgn,
                &request.white,
                &request.black,
                &request.white_elo,
                &request.black_elo,
                &request.result,
                &request.event,
                &request.date,
                &played_at,
                &request.eco,
                &request.opening,
                &request.time_control,
                &request.time_class,
                &request.source_url,
                &source_platform,
                &request.final_fen,
                &request.ply_count,
            ],
        )
        .map_err(|_| "Không thể lưu ván cờ vào máy.".to_string())?;
    connection
        .execute(
            "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
             SELECT ?1, pp.id,
                    CASE WHEN lower(pp.username) = lower(?2) THEN 'w' ELSE 'b' END,
                    datetime('now')
             FROM player_profiles pp
             WHERE (lower(pp.username) = lower(?2) OR lower(pp.username) = lower(?3))
               AND (?4 IS NULL OR pp.platform = ?4)",
            params![&id, &request.white, &request.black, &source_platform],
        )
        .map_err(|_| "Không thể liên kết ván với hồ sơ người chơi.".to_string())?;
    queue_cloud_change(&connection, "game", &id, "upsert")
        .map_err(|_| "Không thể xếp ván vào hàng đợi đồng bộ.".to_string())?;
    Ok(id)
}

pub(crate) fn list_saved_games(
    database: tauri::State<'_, DatabaseState>,
    profile_id: Option<i64>,
) -> Result<Vec<SavedGameSummary>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT id, white, black, white_elo, black_elo, result, event, game_date, played_at, eco,
                    opening, time_control, time_class, source_url, source_platform,
                    analysis_complete, created_at, last_opened_at, final_fen,
                    ply_count,
                    CASE WHEN final_fen IS NULL OR final_fen = '' OR ply_count IS NULL
                         THEN pgn ELSE NULL END
             FROM saved_games sg
             WHERE ?1 IS NULL OR EXISTS (
               SELECT 1 FROM game_profiles gp WHERE gp.game_id = sg.id AND gp.profile_id = ?1
             )
             ORDER BY COALESCE(NULLIF(played_at, ''), REPLACE(game_date, '.', '-'), created_at) DESC,
                      created_at DESC",
        )
        .map_err(|_| "Không thể đọc kho ván cờ.".to_string())?;
    let games = statement
        .query_map(params![profile_id], |row| {
            Ok(SavedGameSummary {
                id: row.get(0)?,
                white: row.get(1)?,
                black: row.get(2)?,
                white_elo: row.get(3)?,
                black_elo: row.get(4)?,
                result: row.get(5)?,
                event: row.get(6)?,
                date: row.get(7)?,
                played_at: row.get(8)?,
                eco: row.get(9)?,
                opening: row.get(10)?,
                time_control: row.get(11)?,
                time_class: row.get(12)?,
                source_url: row.get(13)?,
                source_platform: row.get(14)?,
                analysis_complete: row.get::<_, i64>(15)? != 0,
                created_at: row.get(16)?,
                last_opened_at: row.get(17)?,
                final_fen: row.get(18)?,
                ply_count: row.get(19)?,
                preview_pgn: row.get(20)?,
            })
        })
        .map_err(|_| "Không thể đọc danh sách ván đã lưu.".to_string())?;
    games
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu kho ván cờ không hợp lệ.".to_string())
}

pub(crate) fn open_saved_game(
    database: tauri::State<'_, DatabaseState>,
    id: String,
) -> Result<SavedGameDetail, String> {
    if id.len() != 64 || !id.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Mã ván cờ không hợp lệ.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let updated = connection
        .execute(
            "UPDATE saved_games SET last_opened_at = datetime('now') WHERE id = ?1",
            params![&id],
        )
        .map_err(|_| "Không thể cập nhật ván vừa mở.".to_string())?;
    if updated == 0 {
        return Err("Ván cờ không còn trong kho.".to_string());
    }
    queue_cloud_change(&connection, "game", &id, "upsert")
        .map_err(|_| "Không thể cập nhật hàng đợi cloud cho ván vừa mở.".to_string())?;
    connection
        .query_row(
            "SELECT id, pgn FROM saved_games WHERE id = ?1",
            params![&id],
            |row| {
                Ok(SavedGameDetail {
                    id: row.get(0)?,
                    pgn: row.get(1)?,
                })
            },
        )
        .map_err(|_| "Không thể đọc PGN đã lưu.".to_string())
}

pub(crate) fn delete_saved_game(
    database: tauri::State<'_, DatabaseState>,
    id: String,
) -> Result<bool, String> {
    if id.len() != 64 || !id.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Mã ván cờ không hợp lệ.".to_string());
    }
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu xoá ván cờ.".to_string())?;
    remove_training_for_game(&transaction, &id, true)?;
    transaction
        .execute(
            "DELETE FROM cloud_sync_queue
             WHERE (entity_type = 'engine_analysis' AND entity_id IN (
               SELECT cloud_id FROM engine_analyses WHERE game_id = ?1
             )) OR (entity_type = 'analysis_manifest' AND entity_id IN (
               SELECT cloud_id FROM analysis_manifests WHERE game_id = ?1
             ))",
            params![&id],
        )
        .map_err(|_| "Không thể dọn hàng đợi phân tích của ván.".to_string())?;
    transaction
        .execute(
            "DELETE FROM engine_analyses WHERE game_id = ?1",
            params![&id],
        )
        .map_err(|_| "Không thể xoá dữ liệu phân tích của ván.".to_string())?;
    transaction
        .execute(
            "DELETE FROM analysis_manifests WHERE game_id = ?1",
            params![&id],
        )
        .map_err(|_| "Không thể xoá manifest phân tích.".to_string())?;
    transaction
        .execute("DELETE FROM game_profiles WHERE game_id = ?1", params![&id])
        .map_err(|_| "Không thể xoá liên kết hồ sơ của ván.".to_string())?;
    let deleted = transaction
        .execute("DELETE FROM saved_games WHERE id = ?1", params![&id])
        .map_err(|_| "Không thể xoá ván cờ khỏi kho.".to_string())?
        > 0;
    if deleted {
        queue_cloud_change(&transaction, "game", &id, "delete")
            .map_err(|_| "Không thể xếp thao tác xoá vào hàng đợi cloud.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất xoá ván cờ.".to_string())?;
    Ok(deleted)
}
