use crate::*;

pub(crate) fn review_repertoire_node(
    database: tauri::State<'_, DatabaseState>,
    request: ReviewRepertoireNodeRequest,
) -> Result<RepertoireProgress, String> {
    if request.hints_used > 3 || request.failed_attempts > 100 || request.duration_ms > 86_400_000 {
        return Err("Kết quả luyện tập không hợp lệ.".to_string());
    }
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho khai cuộc.".to_string())?;
    let node_exists: bool = connection
        .query_row(
            "SELECT 1 FROM repertoire_nodes WHERE id = ?1",
            params![request.node_id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|_| "Không thể kiểm tra node.".to_string())?
        .unwrap_or(false);
    if !node_exists {
        return Err("Không tìm thấy node repertoire.".to_string());
    }
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu lưu kết quả.".to_string())?;
    transaction
        .execute(
            "INSERT OR IGNORE INTO repertoire_progress
             (node_id, profile_id, due_at, updated_at)
             VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![request.node_id, request.profile_id],
        )
        .map_err(|_| "Không thể khởi tạo tiến độ.".to_string())?;
    let current: (u32, u32, Option<String>) = transaction
        .query_row(
            "SELECT interval_days, correct_streak, last_correct_at
             FROM repertoire_progress WHERE node_id = ?1",
            params![request.node_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Không thể đọc tiến độ.".to_string())?;
    let today: String = transaction
        .query_row("SELECT strftime('%Y-%m-%d', 'now')", [], |row| row.get(0))
        .map_err(|_| "Không thể đọc thời gian hệ thống.".to_string())?;
    let same_correct_day = current
        .2
        .as_deref()
        .is_some_and(|value| value.get(..10) == Some(today.as_str()));
    // Nước lệch → coi như sai (CPL lớn) để schedule_review đẩy về learning/10 phút.
    let effective_cpl = if request.correct {
        request.centipawn_loss
    } else {
        1_000.0
    };
    let schedule = schedule_review(
        current.0,
        current.1,
        effective_cpl,
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
            "UPDATE repertoire_progress SET
               correct_count = correct_count + CASE WHEN ?2 = 1 THEN 1 ELSE 0 END,
               wrong_count = wrong_count + CASE WHEN ?2 = 0 THEN 1 ELSE 0 END,
               correct_streak = ?3,
               status = ?4,
               interval_days = ?5,
               due_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?6),
               last_correct_at = CASE WHEN ?2 = 1
                 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE last_correct_at END,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE node_id = ?1",
            params![
                request.node_id,
                schedule.correct,
                schedule.next_streak,
                status,
                schedule.interval_days,
                delay,
            ],
        )
        .map_err(|_| "Không thể cập nhật tiến độ.".to_string())?;
    queue_cloud_change(
        &transaction,
        "repertoire_progress",
        &request.node_id,
        "upsert",
    )
    .map_err(|_| "Không thể xếp tiến độ vào hàng đợi cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu kết quả.".to_string())?;
    get_repertoire_progress(&connection, &request.node_id)
}

pub(crate) fn get_repertoire_progress(
    connection: &Connection,
    node_id: &str,
) -> Result<RepertoireProgress, String> {
    connection
        .query_row(
            "SELECT node_id, correct_count, wrong_count, correct_streak, status,
                    interval_days, due_at, last_correct_at
             FROM repertoire_progress WHERE node_id = ?1",
            params![node_id],
            |row| {
                Ok(RepertoireProgress {
                    node_id: row.get(0)?,
                    correct_count: row.get(1)?,
                    wrong_count: row.get(2)?,
                    correct_streak: row.get(3)?,
                    status: row.get(4)?,
                    interval_days: row.get(5)?,
                    due_at: row.get(6)?,
                    last_correct_at: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(|_| "Không thể đọc tiến độ.".to_string())?
        .ok_or_else(|| "Không tìm thấy tiến độ.".to_string())
}
