use crate::*;
use rusqlite::Transaction;
use std::collections::HashMap;

pub(crate) struct CarriedProgress {
    pub(crate) node_key: String,
    pub(crate) profile_id: i64,
    pub(crate) correct_count: i64,
    pub(crate) wrong_count: i64,
    pub(crate) correct_streak: i64,
    pub(crate) status: String,
    pub(crate) interval_days: i64,
    pub(crate) due_at: String,
    pub(crate) last_correct_at: Option<String>,
    pub(crate) updated_at: String,
}

/// Đọc tiến độ của các repertoire trùng theo `node_key`, hợp nhất bằng MAX.
/// Phải gọi TRƯỚC khi xoá row của bên thua.
pub(crate) fn read_carried_progress(
    transaction: &Transaction<'_>,
    loser_ids: &[String],
) -> Result<Vec<CarriedProgress>, String> {
    let mut merged: HashMap<String, CarriedProgress> = HashMap::new();
    for repertoire_id in loser_ids {
        let mut statement = transaction
            .prepare(
                "SELECT n.position_key || '|' || n.move_uci, p.profile_id, p.correct_count,
                        p.wrong_count, p.correct_streak, p.status, p.interval_days,
                        p.due_at, p.last_correct_at, p.updated_at
                 FROM repertoire_progress p
                 JOIN repertoire_nodes n ON n.id = p.node_id
                 WHERE n.repertoire_id = ?1",
            )
            .map_err(|_| "Không thể đọc tiến độ repertoire trùng.".to_string())?;
        let rows = statement
            .query_map(params![repertoire_id], |row| {
                Ok(CarriedProgress {
                    node_key: row.get(0)?,
                    profile_id: row.get(1)?,
                    correct_count: row.get(2)?,
                    wrong_count: row.get(3)?,
                    correct_streak: row.get(4)?,
                    status: row.get(5)?,
                    interval_days: row.get(6)?,
                    due_at: row.get(7)?,
                    last_correct_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|_| "Không thể đọc tiến độ repertoire trùng.".to_string())?;
        for row in rows {
            let item = row.map_err(|_| "Tiến độ repertoire trùng không hợp lệ.".to_string())?;
            match merged.get_mut(&item.node_key) {
                None => {
                    merged.insert(item.node_key.clone(), item);
                }
                Some(current) => {
                    current.correct_count = current.correct_count.max(item.correct_count);
                    current.wrong_count = current.wrong_count.max(item.wrong_count);
                    current.correct_streak = current.correct_streak.max(item.correct_streak);
                    if item.last_correct_at > current.last_correct_at {
                        current.last_correct_at = item.last_correct_at;
                    }
                    if item.updated_at > current.updated_at {
                        current.status = item.status;
                        current.interval_days = item.interval_days;
                        current.due_at = item.due_at;
                        current.updated_at = item.updated_at;
                    }
                }
            }
        }
    }
    Ok(merged.into_values().collect())
}

/// Gắn tiến độ đã gộp vào node tương ứng của repertoire survivor.
/// Trả về danh sách node id đã ghi, để enqueue upsert.
pub(crate) fn apply_carried_progress(
    transaction: &Transaction<'_>,
    repertoire_id: &str,
    carried: &[CarriedProgress],
) -> Result<Vec<String>, String> {
    let mut written = Vec::new();
    for item in carried {
        let node_id = repertoire_node_id(repertoire_id, &item.node_key);
        let node_exists: bool = transaction
            .query_row(
                "SELECT 1 FROM repertoire_nodes WHERE id = ?1",
                params![node_id],
                |_| Ok(true),
            )
            .optional()
            .map_err(|_| "Không thể kiểm tra node repertoire.".to_string())?
            .unwrap_or(false);
        if !node_exists {
            continue;
        }
        transaction
            .execute(
                "INSERT INTO repertoire_progress
                   (node_id, profile_id, correct_count, wrong_count, correct_streak, status,
                    interval_days, due_at, last_correct_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(node_id) DO UPDATE SET
                   correct_count = MAX(repertoire_progress.correct_count, excluded.correct_count),
                   wrong_count = MAX(repertoire_progress.wrong_count, excluded.wrong_count),
                   correct_streak =
                     MAX(repertoire_progress.correct_streak, excluded.correct_streak),
                   status = CASE WHEN excluded.updated_at > repertoire_progress.updated_at
                     THEN excluded.status ELSE repertoire_progress.status END,
                   interval_days = CASE WHEN excluded.updated_at > repertoire_progress.updated_at
                     THEN excluded.interval_days ELSE repertoire_progress.interval_days END,
                   due_at = CASE WHEN excluded.updated_at > repertoire_progress.updated_at
                     THEN excluded.due_at ELSE repertoire_progress.due_at END,
                   last_correct_at =
                     MAX(COALESCE(repertoire_progress.last_correct_at, ''),
                         COALESCE(excluded.last_correct_at, '')),
                   updated_at =
                     MAX(repertoire_progress.updated_at, excluded.updated_at)",
                params![
                    node_id,
                    item.profile_id,
                    item.correct_count,
                    item.wrong_count,
                    item.correct_streak,
                    item.status,
                    item.interval_days,
                    item.due_at,
                    item.last_correct_at,
                    item.updated_at,
                ],
            )
            .map_err(|_| "Không thể gộp tiến độ repertoire.".to_string())?;
        written.push(node_id);
    }
    Ok(written)
}

/// Xoá repertoire trùng. KHÔNG phát tombstone `repertoire`: bên thua và bên
/// survivor dùng chung doc id, tombstone sẽ xoá luôn doc của survivor trên cloud.
pub(crate) fn remove_duplicate_repertoires(
    transaction: &Transaction<'_>,
    duplicate_ids: &[String],
) -> Result<(), String> {
    for id in duplicate_ids {
        transaction
            .execute(
                "DELETE FROM repertoire_progress WHERE node_id IN
                   (SELECT id FROM repertoire_nodes WHERE repertoire_id = ?1)",
                params![id],
            )
            .map_err(|_| "Không thể gộp tiến độ repertoire trùng.".to_string())?;
        transaction
            .execute(
                "DELETE FROM repertoire_nodes WHERE repertoire_id = ?1",
                params![id],
            )
            .map_err(|_| "Không thể gộp node repertoire trùng.".to_string())?;
        transaction
            .execute("DELETE FROM repertoires WHERE id = ?1", params![id])
            .map_err(|_| "Không thể gộp repertoire trùng.".to_string())?;
    }
    Ok(())
}

/// Xoá các node không còn trong seed set và phát tombstone.
/// Tombstone `repertoire_progress` chỉ phát khi node đó thực sự có tiến độ —
/// nếu bỏ, progress doc mồ côi sẽ nằm lại Firestore và hồi sinh vào inbox máy khác.
pub(crate) fn tombstone_stale_nodes(
    transaction: &Transaction<'_>,
    stale_node_ids: &[String],
) -> Result<(), String> {
    for node_id in stale_node_ids {
        let had_progress = transaction
            .execute(
                "DELETE FROM repertoire_progress WHERE node_id = ?1",
                params![node_id],
            )
            .map_err(|_| "Không thể dọn tiến độ node cũ.".to_string())?
            > 0;
        transaction
            .execute(
                "DELETE FROM repertoire_nodes WHERE id = ?1",
                params![node_id],
            )
            .map_err(|_| "Không thể xoá node repertoire cũ.".to_string())?;
        queue_cloud_change(transaction, "repertoire_node", node_id, "delete")
            .map_err(|_| "Không thể xếp tombstone node repertoire.".to_string())?;
        if had_progress {
            queue_cloud_change(transaction, "repertoire_progress", node_id, "delete")
                .map_err(|_| "Không thể xếp tombstone tiến độ repertoire.".to_string())?;
        }
    }
    Ok(())
}

pub(crate) fn queue_repertoire_upserts(
    transaction: &Transaction<'_>,
    entity_type: &str,
    ids: &[String],
) -> Result<(), String> {
    for id in ids {
        queue_cloud_change(transaction, entity_type, id, "upsert")
            .map_err(|_| "Không thể xếp thay đổi repertoire vào hàng đợi cloud.".to_string())?;
    }
    Ok(())
}
