use crate::*;

pub(crate) fn repertoire_node_id(repertoire_id: &str, node_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{repertoire_id}:{node_key}"));
    format!("{:x}", hasher.finalize())
}

fn map_repertoire_node(row: &rusqlite::Row<'_>) -> rusqlite::Result<RepertoireNode> {
    Ok(RepertoireNode {
        id: row.get(0)?,
        repertoire_id: row.get(1)?,
        parent_id: row.get(2)?,
        position_key: row.get(3)?,
        fen: row.get(4)?,
        move_san: row.get(5)?,
        move_uci: row.get(6)?,
        side_to_move: row.get(7)?,
        is_user_move: row.get::<_, i64>(8)? != 0,
        source: row.get(9)?,
        frequency: row.get(10)?,
        avg_cpl: row.get(11)?,
        comment: row.get(12)?,
        status: row.get(13)?,
        due_at: row.get(14)?,
        interval_days: row.get::<_, Option<i64>>(15)?.unwrap_or(0),
        correct_count: row.get::<_, Option<i64>>(16)?.unwrap_or(0),
        wrong_count: row.get::<_, Option<i64>>(17)?.unwrap_or(0),
        correct_streak: row.get::<_, Option<i64>>(18)?.unwrap_or(0),
    })
}

const NODE_COLUMNS: &str = "n.id, n.repertoire_id, n.parent_id, n.position_key, n.fen,
     n.move_san, n.move_uci, n.side_to_move, n.is_user_move, n.source,
     n.frequency, n.avg_cpl, n.comment,
     p.status, p.due_at, p.interval_days, p.correct_count, p.wrong_count, p.correct_streak";

pub(crate) fn save_repertoire(
    database: tauri::State<'_, DatabaseState>,
    request: SaveRepertoireRequest,
) -> Result<SaveRepertoireResult, String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho khai cuộc.".to_string())?;
    save_repertoire_connection(&mut connection, request)
}

pub(crate) fn list_repertoires(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<Vec<Repertoire>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho khai cuộc.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT r.id, r.profile_id, r.color, r.name, r.eco, r.source,
                    (SELECT COUNT(*) FROM repertoire_nodes n WHERE n.repertoire_id = r.id),
                    (SELECT COUNT(*) FROM repertoire_nodes n
                       JOIN repertoire_progress p ON p.node_id = n.id
                      WHERE n.repertoire_id = r.id AND n.is_user_move = 1
                        AND p.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    r.created_at, r.updated_at
             FROM repertoires r
             WHERE r.profile_id = ?1
             ORDER BY r.updated_at DESC",
        )
        .map_err(|_| "Không thể chuẩn bị danh sách repertoire.".to_string())?;
    let rows = statement
        .query_map(params![profile_id], |row| {
            Ok(Repertoire {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                color: row.get(2)?,
                name: row.get(3)?,
                eco: row.get(4)?,
                source: row.get(5)?,
                node_count: row.get(6)?,
                due_count: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|_| "Không thể đọc danh sách repertoire.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu repertoire không hợp lệ.".to_string())
}

pub(crate) fn get_repertoire_tree(
    database: tauri::State<'_, DatabaseState>,
    repertoire_id: String,
) -> Result<Vec<RepertoireNode>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho khai cuộc.".to_string())?;
    let sql = format!(
        "SELECT {NODE_COLUMNS}
         FROM repertoire_nodes n
         LEFT JOIN repertoire_progress p ON p.node_id = n.id
         WHERE n.repertoire_id = ?1
         ORDER BY n.created_at"
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|_| "Không thể chuẩn bị cây repertoire.".to_string())?;
    let rows = statement
        .query_map(params![repertoire_id], map_repertoire_node)
        .map_err(|_| "Không thể đọc cây repertoire.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu cây repertoire không hợp lệ.".to_string())
}

pub(crate) fn next_repertoire_nodes(
    database: tauri::State<'_, DatabaseState>,
    repertoire_id: String,
) -> Result<Vec<RepertoireNode>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho khai cuộc.".to_string())?;
    // Ưu tiên: node đến hạn trước (due_at cũ nhất), rồi điểm composite
    // (frequency + avg_cpl + (1 - recall_rate)) theo §11 "Ưu tiên nội dung".
    let sql = format!(
        "SELECT {NODE_COLUMNS}
         FROM repertoire_nodes n
         LEFT JOIN repertoire_progress p ON p.node_id = n.id
         WHERE n.repertoire_id = ?1 AND n.is_user_move = 1
           AND (p.due_at IS NULL OR p.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ORDER BY COALESCE(p.due_at, '0') ASC,
                  (n.frequency * 1.0 + COALESCE(n.avg_cpl, 0) * 0.5
                   + (1.0 - CASE WHEN (COALESCE(p.correct_count,0) + COALESCE(p.wrong_count,0)) > 0
                            THEN CAST(p.correct_count AS REAL)
                                 / (p.correct_count + p.wrong_count)
                            ELSE 0 END) * 10.0) DESC
         LIMIT 200"
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|_| "Không thể chuẩn bị hàng đợi repertoire.".to_string())?;
    let rows = statement
        .query_map(params![repertoire_id], map_repertoire_node)
        .map_err(|_| "Không thể đọc hàng đợi repertoire.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu hàng đợi repertoire không hợp lệ.".to_string())
}

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
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu kết quả.".to_string())?;
    get_repertoire_progress(&connection, &request.node_id)
}

fn get_repertoire_progress(
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

pub(crate) fn add_repertoire_move(
    database: tauri::State<'_, DatabaseState>,
    request: AddRepertoireMoveRequest,
) -> Result<RepertoireNode, String> {
    if request.fen.is_empty() || request.fen.len() > 200 || request.move_uci.is_empty() {
        return Err("Dữ liệu nước đi không hợp lệ.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho khai cuộc.".to_string())?;
    let node_key = format!("{}|{}", request.position_key, request.move_uci);
    let node_id = repertoire_node_id(&request.repertoire_id, &node_key);
    connection
        .execute(
            "INSERT OR IGNORE INTO repertoire_nodes
             (id, repertoire_id, parent_id, position_key, fen, move_san, move_uci,
              side_to_move, is_user_move, source, frequency, avg_cpl, comment, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 'manual', 0, NULL, ?9,
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![
                node_id,
                request.repertoire_id,
                request.parent_id,
                request.position_key,
                request.fen,
                request.move_san,
                request.move_uci,
                request.side_to_move,
                request.comment,
            ],
        )
        .map_err(|_| "Không thể lưu biến phụ.".to_string())?;
    connection
        .execute(
            "UPDATE repertoires SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![request.repertoire_id],
        )
        .ok();
    let sql = format!(
        "SELECT {NODE_COLUMNS}
         FROM repertoire_nodes n
         LEFT JOIN repertoire_progress p ON p.node_id = n.id
         WHERE n.id = ?1"
    );
    connection
        .query_row(&sql, params![node_id], map_repertoire_node)
        .optional()
        .map_err(|_| "Không thể đọc node vừa lưu.".to_string())?
        .ok_or_else(|| "Không tìm thấy node vừa lưu.".to_string())
}
