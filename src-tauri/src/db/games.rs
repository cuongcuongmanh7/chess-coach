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

pub(crate) fn queue_games_for_profile(connection: &Connection, profile_id: i64) -> rusqlite::Result<()> {
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
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    connection
        .execute(
            "INSERT INTO saved_games
             (id, pgn, white, black, white_elo, black_elo, result, event, game_date, played_at,
              eco, opening, time_control, time_class, source_url, source_platform, created_at, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'), datetime('now'))
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
                    analysis_complete, created_at, last_opened_at
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
    transaction
        .execute(
            "DELETE FROM engine_analyses WHERE game_id = ?1",
            params![&id],
        )
        .map_err(|_| "Không thể xoá dữ liệu phân tích của ván.".to_string())?;
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

pub(crate) const ENGINE_VERSION: &str = "stockfish-18-lite";

pub(crate) fn validate_game_id(id: &str) -> Result<(), String> {
    if id.len() == 64 && id.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Mã ván cờ không hợp lệ.".to_string())
    }
}

pub(crate) fn save_engine_analysis(
    database: tauri::State<'_, DatabaseState>,
    request: SaveEngineAnalysisRequest,
) -> Result<(), String> {
    validate_game_id(&request.game_id)?;
    let result_json = serde_json::to_string(&request.result)
        .map_err(|_| "Không thể mã hoá kết quả Stockfish.".to_string())?;
    let tags_json = serde_json::to_string(&request.tags)
        .map_err(|_| "Không thể mã hoá nhãn phân tích.".to_string())?;
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho phân tích.".to_string())?;
    let game_exists = connection
        .query_row(
            "SELECT 1 FROM saved_games WHERE id = ?1",
            params![&request.game_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|_| "Không thể kiểm tra ván trước khi lưu phân tích.".to_string())?
        .is_some();
    if !game_exists {
        return Ok(());
    }
    connection
        .execute(
            "INSERT INTO engine_analyses
             (game_id, ply, engine_version, depth, multipv, result_json, color, phase, quality,
              centipawn_loss, think_time_seconds, is_quick, is_time_pressure, tags_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'))
             ON CONFLICT(game_id, ply, engine_version, depth, multipv) DO UPDATE SET
               result_json = excluded.result_json,
               color = excluded.color,
               phase = excluded.phase,
               quality = excluded.quality,
               centipawn_loss = excluded.centipawn_loss,
               think_time_seconds = excluded.think_time_seconds,
               is_quick = excluded.is_quick,
               is_time_pressure = excluded.is_time_pressure,
               tags_json = excluded.tags_json,
               updated_at = datetime('now')",
            params![
                &request.game_id,
                request.ply,
                ENGINE_VERSION,
                request.depth,
                engine_multipv(),
                result_json,
                &request.color,
                &request.phase,
                &request.quality,
                request.centipawn_loss,
                request.think_time_seconds,
                request.is_quick,
                request.is_time_pressure,
                tags_json,
            ],
        )
        .map_err(|_| "Không thể lưu kết quả Stockfish.".to_string())?;
    Ok(())
}

pub(crate) fn list_engine_analyses(
    database: tauri::State<'_, DatabaseState>,
    game_id: String,
) -> Result<Vec<StoredEngineAnalysis>, String> {
    validate_game_id(&game_id)?;
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho phân tích.".to_string())?;
    list_engine_analyses_connection(&connection, &game_id)
}

pub(crate) fn list_engine_analyses_connection(
    connection: &Connection,
    game_id: &str,
) -> Result<Vec<StoredEngineAnalysis>, String> {
    let mut statement = connection
        .prepare(
            "SELECT ea.ply, ea.depth, ea.result_json
             FROM engine_analyses ea
             WHERE ea.game_id = ?1 AND ea.engine_version = ?2 AND ea.multipv = ?3
               AND ea.depth = (
                 SELECT MAX(best.depth) FROM engine_analyses best
                 WHERE best.game_id = ea.game_id AND best.ply = ea.ply
                   AND best.engine_version = ea.engine_version AND best.multipv = ea.multipv
               )
             ORDER BY ea.ply",
        )
        .map_err(|_| "Không thể đọc kết quả Stockfish đã lưu.".to_string())?;
    let rows = statement
        .query_map(params![game_id, ENGINE_VERSION, engine_multipv()], |row| {
            let raw: String = row.get(2)?;
            let result = serde_json::from_str(&raw).unwrap_or(Value::Null);
            Ok(StoredEngineAnalysis {
                ply: row.get(0)?,
                depth: row.get(1)?,
                result,
            })
        })
        .map_err(|_| "Không thể đọc danh sách kết quả Stockfish.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu Stockfish đã lưu không hợp lệ.".to_string())
}

pub(crate) fn mark_game_analysis_complete(
    database: tauri::State<'_, DatabaseState>,
    game_id: String,
) -> Result<(), String> {
    validate_game_id(&game_id)?;
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    connection
        .execute(
            "UPDATE saved_games SET analysis_complete = 1, analyzed_at = datetime('now') WHERE id = ?1",
            params![game_id],
        )
        .map_err(|_| "Không thể đánh dấu ván đã phân tích.".to_string())?;
    Ok(())
}

pub(crate) fn get_dashboard_records(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<Vec<DashboardMoveRecord>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho thống kê.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT ea.game_id, COALESCE(sg.played_at, sg.game_date), sg.eco, sg.opening, sg.time_control, sg.time_class,
                    ea.color, ea.phase, ea.quality, ea.centipawn_loss, ea.think_time_seconds,
                    ea.is_quick, ea.is_time_pressure, ea.tags_json
             FROM engine_analyses ea
             JOIN saved_games sg ON sg.id = ea.game_id
             JOIN game_profiles gp ON gp.game_id = sg.id AND gp.profile_id = ?1
             WHERE sg.analysis_complete = 1
               AND ea.engine_version = ?2
               AND ea.multipv = ?3
               AND ea.depth = (
                 SELECT MAX(best.depth) FROM engine_analyses best
                 WHERE best.game_id = ea.game_id AND best.ply = ea.ply
                   AND best.engine_version = ea.engine_version AND best.multipv = ea.multipv
               )
               AND ea.color = gp.player_color
             ORDER BY COALESCE(NULLIF(sg.played_at, ''), REPLACE(sg.game_date, '.', '-'), sg.created_at), ea.ply",
        )
        .map_err(|_| "Không thể chuẩn bị dữ liệu tiến bộ.".to_string())?;
    let rows = statement
        .query_map(params![profile_id, ENGINE_VERSION, engine_multipv()], |row| {
            let tags_json: String = row.get(13)?;
            Ok(DashboardMoveRecord {
                game_id: row.get(0)?,
                date: row.get(1)?,
                eco: row.get(2)?,
                opening: row.get(3)?,
                time_control: row.get(4)?,
                time_class: row.get(5)?,
                player_color: row.get(6)?,
                phase: row.get(7)?,
                quality: row.get(8)?,
                centipawn_loss: row.get(9)?,
                think_time_seconds: row.get(10)?,
                is_quick: row.get::<_, i64>(11)? != 0,
                is_time_pressure: row.get::<_, i64>(12)? != 0,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
            })
        })
        .map_err(|_| "Không thể đọc dữ liệu tiến bộ.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu tiến bộ không hợp lệ.".to_string())
}
