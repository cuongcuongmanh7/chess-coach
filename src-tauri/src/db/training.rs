use crate::*;

pub(crate) fn training_card_id(profile_key: &str, game_id: &str, ply: u32) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{profile_key}:{game_id}:{ply}:{ENGINE_VERSION}"));
    format!("{:x}", hasher.finalize())
}

fn parse_json_list(raw: String) -> Vec<String> {
    serde_json::from_str(&raw).unwrap_or_default()
}

pub(crate) fn map_training_card(row: &rusqlite::Row<'_>) -> rusqlite::Result<TrainingCard> {
    let best_line = parse_json_list(row.get(9)?);
    let tags = parse_json_list(row.get(14)?);
    Ok(TrainingCard {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        game_id: row.get(2)?,
        ply: row.get(3)?,
        fen: row.get(4)?,
        side_to_move: row.get(5)?,
        played_move: row.get(6)?,
        best_move: row.get(7)?,
        best_line,
        quality: row.get(10)?,
        centipawn_loss: row.get(11)?,
        phase: row.get(12)?,
        opening: row.get(13)?,
        tags,
        status: row.get(15)?,
        due_at: row.get(16)?,
        interval_days: row.get(17)?,
        correct_streak: row.get(18)?,
        attempts: row.get(19)?,
        lapses: row.get(20)?,
        starred: row.get::<_, i64>(21)? != 0,
        suspended: row.get::<_, i64>(22)? != 0,
        last_correct_at: row.get(23)?,
        time_class: row.get(24)?,
        game_date: row.get(25)?,
    })
}

pub(crate) fn review_training_card(
    database: tauri::State<'_, DatabaseState>,
    request: ReviewTrainingCardRequest,
) -> Result<TrainingCard, String> {
    if request.hints_used > 3 || request.failed_attempts > 100 || request.duration_ms > 86_400_000 {
        return Err("Kết quả luyện tập không hợp lệ.".to_string());
    }
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho bài tập.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu lưu kết quả.".to_string())?;
    let current: (u32, u32, Option<String>) = transaction
        .query_row(
            "SELECT interval_days, correct_streak, last_correct_at
             FROM training_cards WHERE id = ?1",
            params![&request.card_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|_| "Không thể đọc training card.".to_string())?
        .ok_or_else(|| "Không tìm thấy training card.".to_string())?;
    let today: String = transaction
        .query_row("SELECT strftime('%Y-%m-%d', 'now')", [], |row| row.get(0))
        .map_err(|_| "Không thể đọc thời gian hệ thống.".to_string())?;
    let same_correct_day = current
        .2
        .as_deref()
        .is_some_and(|value| value.get(..10) == Some(today.as_str()));
    let schedule = schedule_review(
        current.0,
        current.1,
        request.centipawn_loss,
        request.hints_used,
        request.failed_attempts,
        request.duration_ms,
        same_correct_day,
    );
    let delay = format!("+{} seconds", schedule.delay_seconds);
    let status = if !schedule.correct || schedule.result == "revealed" {
        "learning"
    } else if schedule.next_streak >= 3 {
        "mastered"
    } else {
        "review"
    };
    transaction
        .execute(
            "INSERT INTO training_attempts
             (card_id, attempted_move, result, centipawn_loss, hints_used, duration_ms, attempted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![
                &request.card_id,
                &request.attempted_move,
                schedule.result,
                request.centipawn_loss,
                request.hints_used,
                request.duration_ms,
            ],
        )
        .map_err(|_| "Không thể lưu lần luyện.".to_string())?;
    transaction
        .execute(
            "UPDATE training_cards SET
               status = ?2,
               due_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?3),
               interval_days = ?4,
               correct_streak = ?5,
               attempts = attempts + 1,
               lapses = lapses + CASE WHEN ?6 = 0 THEN 1 ELSE 0 END,
               last_correct_at = CASE WHEN ?6 = 1
                 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE last_correct_at END,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![
                &request.card_id,
                status,
                delay,
                schedule.interval_days,
                schedule.next_streak,
                schedule.correct,
            ],
        )
        .map_err(|_| "Không thể cập nhật lịch ôn.".to_string())?;
    queue_cloud_change(&transaction, "training_progress", &request.card_id, "upsert")
        .map_err(|_| "Không thể xếp hàng đồng bộ tiến độ.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu kết quả.".to_string())?;
    get_training_card(&connection, &request.card_id)
}

fn get_training_card(connection: &Connection, card_id: &str) -> Result<TrainingCard, String> {
    connection
        .query_row(
            "SELECT tc.id, tc.profile_id, tc.game_id, tc.ply, tc.fen, tc.side_to_move,
                    tc.played_move, tc.best_move, tc.engine_version, tc.best_line_json,
                    tc.quality, tc.centipawn_loss, tc.phase, tc.opening, tc.tags_json,
                    tc.status, tc.due_at, tc.interval_days, tc.correct_streak,
                    tc.attempts, tc.lapses, tc.starred, tc.suspended, tc.last_correct_at,
                    sg.time_class, COALESCE(sg.played_at, sg.game_date)
             FROM training_cards tc JOIN saved_games sg ON sg.id = tc.game_id
             WHERE tc.id = ?1",
            params![card_id],
            map_training_card,
        )
        .optional()
        .map_err(|_| "Không thể đọc training card.".to_string())?
        .ok_or_else(|| "Không tìm thấy training card.".to_string())
}

pub(crate) fn update_training_card(
    database: tauri::State<'_, DatabaseState>,
    request: UpdateTrainingCardRequest,
) -> Result<TrainingCard, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho bài tập.".to_string())?;
    connection
        .execute(
            "UPDATE training_cards SET
               starred = COALESCE(?2, starred),
               suspended = COALESCE(?3, suspended),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![&request.card_id, request.starred, request.suspended],
        )
        .map_err(|_| "Không thể cập nhật training card.".to_string())?;
    queue_cloud_change(&connection, "training_progress", &request.card_id, "upsert")
        .map_err(|_| "Không thể xếp hàng đồng bộ tiến độ.".to_string())?;
    get_training_card(&connection, &request.card_id)
}

pub(crate) fn get_training_stats(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<TrainingStats, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho bài tập.".to_string())?;
    let cards: (u32, u32, u32, u32) = connection
        .query_row(
            "SELECT COUNT(*),
                    COALESCE(SUM(CASE WHEN suspended = 0 AND due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END), 0)
             FROM training_cards WHERE profile_id = ?1",
            params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "Không thể tính thống kê bài tập.".to_string())?;
    let attempts: (u32, f64, f64) = connection
        .query_row(
            "SELECT COUNT(*),
                    COALESCE(AVG(CASE WHEN ta.result IN ('clean', 'slow') THEN 1.0 ELSE 0.0 END), 0),
                    COALESCE(AVG(ta.hints_used), 0)
             FROM training_attempts ta
             JOIN training_cards tc ON tc.id = ta.card_id
             WHERE tc.profile_id = ?1",
            params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Không thể tính lịch sử luyện tập.".to_string())?;
    let today: i64 = connection
        .query_row("SELECT CAST(julianday('now') AS INTEGER)", [], |row| row.get(0))
        .unwrap_or(0);
    let mut statement = connection
        .prepare(
            "SELECT DISTINCT CAST(julianday(substr(ta.attempted_at, 1, 10)) AS INTEGER)
             FROM training_attempts ta JOIN training_cards tc ON tc.id = ta.card_id
             WHERE tc.profile_id = ?1 ORDER BY 1 DESC",
        )
        .map_err(|_| "Không thể tính streak.".to_string())?;
    let days = statement
        .query_map(params![profile_id], |row| row.get::<_, i64>(0))
        .map_err(|_| "Không thể đọc streak.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu streak không hợp lệ.".to_string())?;
    let mut streak_days = 0u32;
    let mut expected = days.first().copied().unwrap_or(today);
    if expected >= today - 1 {
        for day in days {
            if day != expected {
                break;
            }
            streak_days += 1;
            expected -= 1;
        }
    }
    Ok(TrainingStats {
        total: cards.0,
        due: cards.1,
        new_cards: cards.2,
        mastered: cards.3,
        attempts: attempts.0,
        first_try_correct_rate: attempts.1,
        average_hints: attempts.2,
        streak_days,
    })
}
