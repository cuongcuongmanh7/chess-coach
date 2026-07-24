use crate::*;

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
    let cloud_id = analysis_cloud_id(
        &request.game_id,
        request.ply,
        ENGINE_VERSION,
        request.depth,
        engine_multipv() as u32,
    );
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho phân tích.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu lưu kết quả Stockfish.".to_string())?;
    let game_exists = transaction
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
    transaction
        .execute(
            "INSERT INTO engine_analyses
             (game_id, ply, engine_version, depth, multipv, result_json, color, phase, quality,
              centipawn_loss, think_time_seconds, is_quick, is_time_pressure, tags_json,
              updated_at, cloud_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?15)
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
               updated_at = excluded.updated_at,
               cloud_id = excluded.cloud_id",
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
                &cloud_id,
            ],
        )
        .map_err(|_| "Không thể lưu kết quả Stockfish.".to_string())?;
    queue_cloud_change(&transaction, "engine_analysis", &cloud_id, "upsert")
        .map_err(|_| "Không thể xếp kết quả Stockfish vào hàng đợi cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu kết quả Stockfish.".to_string())
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

pub(crate) fn refresh_analysis_completion(
    connection: &Connection,
    game_id: &str,
) -> rusqlite::Result<usize> {
    connection.execute(
        "UPDATE saved_games
         SET analysis_complete = 1,
             analyzed_at = (
               SELECT completed_at FROM analysis_manifests
               WHERE game_id = ?1 AND engine_version = ?2 AND multipv = ?3
             )
         WHERE id = ?1 AND EXISTS (
           SELECT 1 FROM analysis_manifests manifest
           WHERE manifest.game_id = ?1
             AND manifest.engine_version = ?2 AND manifest.multipv = ?3
             AND manifest.ply_count > 0
             AND (
               SELECT COUNT(DISTINCT analysis.ply) FROM engine_analyses analysis
               WHERE analysis.game_id = ?1
                 AND analysis.engine_version = ?2 AND analysis.multipv = ?3
                 AND analysis.ply BETWEEN 1 AND manifest.ply_count
             ) >= manifest.ply_count
         )",
        params![game_id, ENGINE_VERSION, engine_multipv()],
    )
}

pub(crate) fn mark_game_analysis_complete(
    database: tauri::State<'_, DatabaseState>,
    game_id: String,
) -> Result<(), String> {
    validate_game_id(&game_id)?;
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu đánh dấu phân tích.".to_string())?;
    let (ply_count, max_ply): (u32, Option<u32>) = transaction
        .query_row(
            "SELECT COUNT(DISTINCT ply), MAX(ply) FROM engine_analyses
             WHERE game_id = ?1 AND engine_version = ?2 AND multipv = ?3",
            params![&game_id, ENGINE_VERSION, engine_multipv()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Không thể kiểm tra độ đầy đủ của phân tích.".to_string())?;
    if ply_count == 0 || max_ply != Some(ply_count) {
        return Err("Phân tích toàn ván chưa có đủ các nước liên tiếp.".to_string());
    }
    let cloud_id = analysis_manifest_cloud_id(&game_id, ENGINE_VERSION, engine_multipv() as u32);
    transaction
        .execute(
            "UPDATE saved_games
             SET analysis_complete = 1,
                 analyzed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![&game_id],
        )
        .map_err(|_| "Không thể đánh dấu ván đã phân tích.".to_string())?;
    transaction
        .execute(
            "INSERT INTO analysis_manifests
             (cloud_id, game_id, engine_version, multipv, ply_count, completed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5,
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT(game_id, engine_version, multipv) DO UPDATE SET
               cloud_id = excluded.cloud_id,
               ply_count = MAX(analysis_manifests.ply_count, excluded.ply_count),
               completed_at = excluded.completed_at,
               updated_at = excluded.updated_at",
            params![
                &cloud_id,
                &game_id,
                ENGINE_VERSION,
                engine_multipv(),
                ply_count
            ],
        )
        .map_err(|_| "Không thể lưu manifest phân tích.".to_string())?;
    queue_cloud_change(&transaction, "analysis_manifest", &cloud_id, "upsert")
        .map_err(|_| "Không thể xếp manifest phân tích vào hàng đợi cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất đánh dấu phân tích.".to_string())
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
            "SELECT ea.game_id, COALESCE(sg.played_at, sg.game_date), sg.eco, sg.opening,
                    sg.time_control, sg.time_class, ea.color, ea.phase, ea.quality,
                    ea.centipawn_loss, ea.think_time_seconds, ea.is_quick,
                    ea.is_time_pressure, ea.tags_json
             FROM engine_analyses ea
             JOIN saved_games sg ON sg.id = ea.game_id
             JOIN game_profiles gp ON gp.game_id = sg.id AND gp.profile_id = ?1
             WHERE sg.analysis_complete = 1
               AND ea.engine_version = ?2 AND ea.multipv = ?3
               AND ea.depth = (
                 SELECT MAX(best.depth) FROM engine_analyses best
                 WHERE best.game_id = ea.game_id AND best.ply = ea.ply
                   AND best.engine_version = ea.engine_version AND best.multipv = ea.multipv
               )
               AND ea.color = gp.player_color
             ORDER BY COALESCE(NULLIF(sg.played_at, ''), REPLACE(sg.game_date, '.', '-'),
                              sg.created_at), ea.ply",
        )
        .map_err(|_| "Không thể chuẩn bị dữ liệu tiến bộ.".to_string())?;
    let rows = statement
        .query_map(
            params![profile_id, ENGINE_VERSION, engine_multipv()],
            |row| {
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
            },
        )
        .map_err(|_| "Không thể đọc dữ liệu tiến bộ.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu tiến bộ không hợp lệ.".to_string())
}
