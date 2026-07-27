use crate::*;
use rusqlite::Transaction;

/// Giữ tạm doc node chưa có repertoire tương ứng ở local.
///
/// Cần thiết vì `uploadCloudChanges` commit NHIỀU batch Firestore: batch chứa
/// repertoire có thể thành công trong khi batch chứa node thất bại, nên máy khác
/// tải node về trước repertoire ở các vòng sync khác nhau.
pub(crate) fn store_node_inbox(
    transaction: &Transaction<'_>,
    data: &CloudRepertoireNode,
) -> Result<(), String> {
    guard_inbox_capacity(transaction, "repertoire_node_inbox")?;
    transaction
        .execute(
            "INSERT INTO repertoire_node_inbox
               (cloud_id, repertoire_cloud_id, node_key, parent_node_key, position_key, fen,
                move_san, move_uci, side_to_move, is_user_move, source, frequency, avg_cpl,
                comment, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
             ON CONFLICT(cloud_id) DO UPDATE SET
               repertoire_cloud_id = excluded.repertoire_cloud_id,
               node_key = excluded.node_key,
               parent_node_key = excluded.parent_node_key,
               position_key = excluded.position_key,
               fen = excluded.fen,
               move_san = excluded.move_san,
               move_uci = excluded.move_uci,
               side_to_move = excluded.side_to_move,
               is_user_move = excluded.is_user_move,
               source = excluded.source,
               frequency = excluded.frequency,
               avg_cpl = excluded.avg_cpl,
               comment = excluded.comment,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at
             WHERE excluded.updated_at > repertoire_node_inbox.updated_at",
            params![
                data.cloud_id,
                data.repertoire_cloud_id,
                data.node_key,
                data.parent_node_key,
                data.position_key,
                data.fen,
                data.move_san,
                data.move_uci,
                data.side_to_move,
                i64::from(data.is_user_move),
                data.source,
                data.frequency,
                data.avg_cpl,
                data.comment,
                data.created_at,
                data.updated_at,
            ],
        )
        .map_err(|_| "Không thể lưu node repertoire chờ xử lý.".to_string())?;
    Ok(())
}

pub(crate) fn store_progress_inbox(
    transaction: &Transaction<'_>,
    data: &CloudRepertoireProgress,
) -> Result<(), String> {
    guard_inbox_capacity(transaction, "repertoire_progress_inbox")?;
    transaction
        .execute(
            "INSERT INTO repertoire_progress_inbox
               (node_cloud_id, repertoire_cloud_id, profile_key, correct_count, wrong_count,
                correct_streak, status, interval_days, due_at, last_correct_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(node_cloud_id) DO UPDATE SET
               repertoire_cloud_id = excluded.repertoire_cloud_id,
               profile_key = excluded.profile_key,
               correct_count = excluded.correct_count,
               wrong_count = excluded.wrong_count,
               correct_streak = excluded.correct_streak,
               status = excluded.status,
               interval_days = excluded.interval_days,
               due_at = excluded.due_at,
               last_correct_at = excluded.last_correct_at,
               updated_at = excluded.updated_at
             WHERE excluded.updated_at > repertoire_progress_inbox.updated_at",
            params![
                data.node_cloud_id,
                data.repertoire_cloud_id,
                data.profile_key,
                data.correct_count,
                data.wrong_count,
                data.correct_streak,
                data.status,
                data.interval_days,
                data.due_at,
                data.last_correct_at,
                data.updated_at,
            ],
        )
        .map_err(|_| "Không thể lưu tiến độ repertoire chờ xử lý.".to_string())?;
    Ok(())
}

fn guard_inbox_capacity(transaction: &Transaction<'_>, table: &str) -> Result<(), String> {
    let total: i64 = transaction
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .map_err(|_| "Không thể đếm inbox repertoire.".to_string())?;
    if total >= REPERTOIRE_INBOX_LIMIT {
        return Err("Inbox repertoire vượt giới hạn an toàn.".to_string());
    }
    Ok(())
}

/// Giải phóng các doc đã có đủ phụ thuộc ở local.
///
/// TUYỆT ĐỐI không gọi `queue_cloud_change` ở đây: dữ liệu đến từ cloud, enqueue
/// lại sẽ tạo echo loop upload/download vô hạn.
pub(crate) fn drain_repertoire_inbox(transaction: &Transaction<'_>) -> Result<usize, String> {
    let drained_nodes = drain_node_inbox(transaction)?;
    let drained_progress = drain_progress_inbox(transaction)?;
    Ok(drained_nodes + drained_progress)
}

fn drain_node_inbox(transaction: &Transaction<'_>) -> Result<usize, String> {
    let rows = {
        let mut statement = transaction
            .prepare(
                "SELECT i.cloud_id, i.repertoire_cloud_id, i.node_key, i.parent_node_key,
                        i.position_key, i.fen, i.move_san, i.move_uci, i.side_to_move,
                        i.is_user_move, i.source, i.frequency, i.avg_cpl, i.comment,
                        i.created_at, i.updated_at
                 FROM repertoire_node_inbox i
                 JOIN repertoires r ON r.id = i.repertoire_cloud_id",
            )
            .map_err(|_| "Không thể đọc inbox node repertoire.".to_string())?;
        let mapped = statement
            .query_map([], |row| {
                Ok(CloudRepertoireNode {
                    cloud_id: row.get(0)?,
                    repertoire_cloud_id: row.get(1)?,
                    node_key: row.get(2)?,
                    parent_node_key: row.get(3)?,
                    position_key: row.get(4)?,
                    fen: row.get(5)?,
                    move_san: row.get(6)?,
                    move_uci: row.get(7)?,
                    side_to_move: row.get(8)?,
                    is_user_move: row.get::<_, i64>(9)? != 0,
                    source: row.get(10)?,
                    frequency: row.get(11)?,
                    avg_cpl: row.get(12)?,
                    comment: row.get(13)?,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                })
            })
            .map_err(|_| "Không thể đọc inbox node repertoire.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Dữ liệu inbox node repertoire không hợp lệ.".to_string())?;
        mapped
    };
    let mut drained = 0;
    for data in rows {
        apply_remote_node(transaction, &data)?;
        transaction
            .execute(
                "DELETE FROM repertoire_node_inbox WHERE cloud_id = ?1",
                params![data.cloud_id],
            )
            .map_err(|_| "Không thể dọn inbox node repertoire.".to_string())?;
        drained += 1;
    }
    Ok(drained)
}

fn drain_progress_inbox(transaction: &Transaction<'_>) -> Result<usize, String> {
    let rows = {
        let mut statement = transaction
            .prepare(
                "SELECT i.node_cloud_id, i.repertoire_cloud_id, i.profile_key, i.correct_count,
                        i.wrong_count, i.correct_streak, i.status, i.interval_days, i.due_at,
                        i.last_correct_at, i.updated_at
                 FROM repertoire_progress_inbox i
                 JOIN repertoire_nodes n ON n.id = i.node_cloud_id",
            )
            .map_err(|_| "Không thể đọc inbox tiến độ repertoire.".to_string())?;
        let mapped = statement
            .query_map([], |row| {
                Ok(CloudRepertoireProgress {
                    node_cloud_id: row.get(0)?,
                    repertoire_cloud_id: row.get(1)?,
                    profile_key: row.get(2)?,
                    correct_count: row.get(3)?,
                    wrong_count: row.get(4)?,
                    correct_streak: row.get(5)?,
                    status: row.get(6)?,
                    interval_days: row.get(7)?,
                    due_at: row.get(8)?,
                    last_correct_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|_| "Không thể đọc inbox tiến độ repertoire.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Dữ liệu inbox tiến độ repertoire không hợp lệ.".to_string())?;
        mapped
    };
    let mut drained = 0;
    for data in rows {
        if !apply_remote_progress(transaction, &data)? {
            continue;
        }
        transaction
            .execute(
                "DELETE FROM repertoire_progress_inbox WHERE node_cloud_id = ?1",
                params![data.node_cloud_id],
            )
            .map_err(|_| "Không thể dọn inbox tiến độ repertoire.".to_string())?;
        drained += 1;
    }
    Ok(drained)
}
