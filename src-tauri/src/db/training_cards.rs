use crate::*;

pub(crate) fn generate_training_cards(
    database: tauri::State<'_, DatabaseState>,
    request: GenerateTrainingCardsRequest,
) -> Result<GenerateTrainingCardsResult, String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho bài tập.".to_string())?;
    generate_training_cards_connection(&mut connection, request)
}

pub(crate) fn generate_training_cards_connection(
    connection: &mut Connection,
    request: GenerateTrainingCardsRequest,
) -> Result<GenerateTrainingCardsResult, String> {
    validate_game_id(&request.game_id)?;
    if request.cards.len() > 1_000 {
        return Err("Danh sách bài tập vượt quá giới hạn an toàn.".to_string());
    }
    let profile: (String, String, String) = connection
        .query_row(
            "SELECT gp.player_color, pp.platform, lower(pp.username)
             FROM game_profiles gp JOIN player_profiles pp ON pp.id = gp.profile_id
             WHERE gp.game_id = ?1 AND gp.profile_id = ?2",
            params![&request.game_id, request.profile_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|_| "Không thể kiểm tra hồ sơ của ván.".to_string())?
        .ok_or_else(|| "Ván này không thuộc hồ sơ đang chọn.".to_string())?;
    let opening: Option<String> = connection
        .query_row(
            "SELECT opening FROM saved_games WHERE id = ?1",
            params![&request.game_id],
            |row| row.get(0),
        )
        .map_err(|_| "Không thể đọc thông tin ván.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu lưu bài tập.".to_string())?;
    let mut created = 0usize;
    let mut eligible = 0usize;

    for seed in request.cards {
        let quality_allowed = matches!(seed.quality.as_str(), "mistake" | "blunder")
            || (request.include_inaccuracies && seed.quality == "inaccuracy");
        if !quality_allowed || seed.side_to_move != profile.0 {
            continue;
        }
        if seed.fen.is_empty()
            || seed.fen.len() > 200
            || seed.played_move.is_empty()
            || seed.best_move.is_empty()
            || seed.best_line.len() > 20
        {
            return Err("Dữ liệu vị trí bài tập không hợp lệ.".to_string());
        }
        let stored: Option<(String, f64)> = transaction
            .query_row(
                "SELECT quality, centipawn_loss FROM engine_analyses
                 WHERE game_id = ?1 AND ply = ?2 AND engine_version = ?3 AND multipv = ?4
                 ORDER BY depth DESC LIMIT 1",
                params![&request.game_id, seed.ply, ENGINE_VERSION, engine_multipv()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| "Không thể đối chiếu kết quả Stockfish.".to_string())?;
        let Some((stored_quality, stored_loss)) = stored else {
            continue;
        };
        if stored_quality != seed.quality || (stored_loss - seed.centipawn_loss).abs() > 1.0 {
            continue;
        }
        eligible += 1;
        let profile_key = format!("{}:{}", profile.1, profile.2);
        let id = training_card_id(&profile_key, &request.game_id, seed.ply);
        let best_line_json = serde_json::to_string(&seed.best_line)
            .map_err(|_| "Không thể mã hoá best line.".to_string())?;
        let tags_json = serde_json::to_string(&seed.tags)
            .map_err(|_| "Không thể mã hoá nhãn bài tập.".to_string())?;
        created += transaction
            .execute(
                "INSERT OR IGNORE INTO training_cards
                 (id, profile_id, game_id, ply, engine_version, fen, side_to_move,
                  played_move, best_move, best_line_json, quality, centipawn_loss,
                  phase, opening, tags_json, due_at, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                         ?13, ?14, ?15,
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                params![
                    id,
                    request.profile_id,
                    &request.game_id,
                    seed.ply,
                    ENGINE_VERSION,
                    seed.fen,
                    seed.side_to_move,
                    seed.played_move,
                    seed.best_move,
                    best_line_json,
                    seed.quality,
                    seed.centipawn_loss,
                    seed.phase,
                    opening,
                    tags_json,
                ],
            )
            .map_err(|_| "Không thể lưu training card.".to_string())?;
        transaction
            .execute(
                "UPDATE training_cards SET
                   status = (SELECT status FROM training_progress_inbox WHERE card_id = ?1),
                   due_at = (SELECT due_at FROM training_progress_inbox WHERE card_id = ?1),
                   interval_days = (SELECT interval_days FROM training_progress_inbox WHERE card_id = ?1),
                   correct_streak = (SELECT correct_streak FROM training_progress_inbox WHERE card_id = ?1),
                   attempts = (SELECT attempts FROM training_progress_inbox WHERE card_id = ?1),
                   starred = (SELECT starred FROM training_progress_inbox WHERE card_id = ?1),
                   suspended = (SELECT suspended FROM training_progress_inbox WHERE card_id = ?1),
                   updated_at = (SELECT updated_at FROM training_progress_inbox WHERE card_id = ?1)
                 WHERE id = ?1 AND EXISTS (
                   SELECT 1 FROM training_progress_inbox inbox
                   WHERE inbox.card_id = ?1 AND inbox.updated_at > training_cards.updated_at
                 )",
                params![&id],
            )
            .map_err(|_| "Không thể áp dụng tiến độ cloud đang chờ.".to_string())?;
        transaction
            .execute(
                "DELETE FROM training_progress_inbox WHERE card_id = ?1",
                params![&id],
            )
            .map_err(|_| "Không thể dọn tiến độ cloud đã áp dụng.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu bài tập.".to_string())?;
    Ok(GenerateTrainingCardsResult { created, eligible })
}

pub(crate) fn list_training_cards(
    database: tauri::State<'_, DatabaseState>,
    request: ListTrainingCardsRequest,
) -> Result<Vec<TrainingCard>, String> {
    let condition = match request.queue.as_deref().unwrap_or("due") {
        "due" => "tc.suspended = 0 AND tc.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        "new" => "tc.suspended = 0 AND tc.status = 'new'",
        "mastered" => "tc.suspended = 0 AND tc.status = 'mastered'",
        "starred" => "tc.suspended = 0 AND tc.starred = 1",
        "suspended" => "tc.suspended = 1",
        "all" => "tc.suspended = 0",
        _ => return Err("Bộ lọc hàng đợi không hợp lệ.".to_string()),
    };
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho bài tập.".to_string())?;
    let sql = format!(
        "SELECT tc.id, tc.profile_id, tc.game_id, tc.ply, tc.fen, tc.side_to_move,
                tc.played_move, tc.best_move, tc.engine_version, tc.best_line_json,
                tc.quality, tc.centipawn_loss, tc.phase, tc.opening, tc.tags_json,
                tc.status, tc.due_at, tc.interval_days, tc.correct_streak,
                tc.attempts, tc.lapses, tc.starred, tc.suspended, tc.last_correct_at,
                sg.time_class, COALESCE(sg.played_at, sg.game_date)
         FROM training_cards tc JOIN saved_games sg ON sg.id = tc.game_id
         WHERE tc.profile_id = ?1 AND {condition}
         ORDER BY tc.due_at, tc.created_at LIMIT 10000"
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|_| "Không thể chuẩn bị danh sách bài tập.".to_string())?;
    let rows = statement
        .query_map(params![request.profile_id], map_training_card)
        .map_err(|_| "Không thể đọc danh sách bài tập.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu bài tập không hợp lệ.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_only_player_side_and_deduplicates_cards() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection, false).unwrap();
        let game_id = "c".repeat(64);
        connection
            .execute(
                "INSERT INTO player_profiles(platform, username, created_at)
                 VALUES ('chesscom', 'learner', datetime('now'))",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO saved_games
                 (id, pgn, white, black, opening, created_at, last_opened_at)
                 VALUES (?1, '1. e4 e5', 'Learner', 'Opponent', 'Ván cờ Italia',
                         datetime('now'), datetime('now'))",
                params![&game_id],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO game_profiles(game_id, profile_id, player_color, linked_at)
                 VALUES (?1, 1, 'w', datetime('now'))",
                params![&game_id],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO engine_analyses
                 (game_id, ply, engine_version, depth, multipv, result_json, color,
                  phase, quality, centipawn_loss, updated_at)
                 VALUES (?1, 1, ?2, 11, 2, '{}', 'w', 'Khai cuộc', 'mistake', 120,
                         datetime('now'))",
                params![&game_id, ENGINE_VERSION],
            )
            .unwrap();
        let request = || GenerateTrainingCardsRequest {
            game_id: game_id.clone(),
            profile_id: 1,
            include_inaccuracies: false,
            cards: vec![TrainingCardSeed {
                ply: 1,
                fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
                side_to_move: "w".to_string(),
                played_move: "e4".to_string(),
                best_move: "d4".to_string(),
                best_line: vec!["d4".to_string(), "d5".to_string()],
                quality: "mistake".to_string(),
                centipawn_loss: 120.0,
                phase: "Khai cuộc".to_string(),
                tags: vec!["Trung tâm".to_string()],
            }],
        };

        let first = generate_training_cards_connection(&mut connection, request()).unwrap();
        let second = generate_training_cards_connection(&mut connection, request()).unwrap();
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM training_cards", [], |row| row.get(0))
            .unwrap();
        assert_eq!((first.created, first.eligible), (1, 1));
        assert_eq!((second.created, second.eligible), (0, 1));
        assert_eq!(count, 1);
    }
}
