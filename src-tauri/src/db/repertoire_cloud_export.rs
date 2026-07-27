use crate::*;

fn cloud_repertoire(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudRepertoire>> {
    connection
        .query_row(
            "SELECT r.id, p.platform || ':' || lower(p.username), r.color, r.name, r.eco,
                    r.source, r.created_at, r.updated_at
             FROM repertoires r
             JOIN player_profiles p ON p.id = r.profile_id
             WHERE r.id = ?1",
            params![document_id],
            |row| {
                Ok(CloudRepertoire {
                    cloud_id: row.get(0)?,
                    profile_key: row.get(1)?,
                    color: row.get(2)?,
                    name: row.get(3)?,
                    eco: row.get(4)?,
                    source: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .optional()
}

fn cloud_repertoire_node(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudRepertoireNode>> {
    connection
        .query_row(
            "SELECT n.id, n.repertoire_id,
                    n.position_key || '|' || n.move_uci,
                    (SELECT parent.position_key || '|' || parent.move_uci
                       FROM repertoire_nodes parent WHERE parent.id = n.parent_id),
                    n.position_key, n.fen, n.move_san, n.move_uci, n.side_to_move,
                    n.is_user_move, n.source, n.frequency, n.avg_cpl, n.comment,
                    n.created_at, n.updated_at
             FROM repertoire_nodes n
             WHERE n.id = ?1",
            params![document_id],
            |row| {
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
            },
        )
        .optional()
}

fn cloud_repertoire_progress(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudRepertoireProgress>> {
    connection
        .query_row(
            "SELECT g.node_id, n.repertoire_id, p.platform || ':' || lower(p.username),
                    g.correct_count, g.wrong_count, g.correct_streak, g.status,
                    g.interval_days, g.due_at, g.last_correct_at, g.updated_at
             FROM repertoire_progress g
             JOIN repertoire_nodes n ON n.id = g.node_id
             JOIN repertoires r ON r.id = n.repertoire_id
             JOIN player_profiles p ON p.id = r.profile_id
             WHERE g.node_id = ?1",
            params![document_id],
            |row| {
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
            },
        )
        .optional()
}

/// Hạ một queue row mồ côi thành tombstone thay vì trả `Err`.
///
/// Các `export_*` cũ trả `Err` khi entity đã biến mất, và một lỗi như vậy làm chết
/// TOÀN BỘ `export_cloud_changes` → khoá mọi đồng bộ vô thời hạn. Repertoire là
/// domain nhiều thao tác xoá nhất nên phải chịu được trường hợp này. Giữ nguyên
/// `generation` để `acknowledge_cloud_changes` vẫn khớp.
fn demote_missing_to_tombstone(
    connection: &Connection,
    entity_type: &str,
    document_id: &str,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE cloud_sync_queue SET operation = 'delete'
             WHERE entity_type = ?1 AND entity_id = ?2",
            params![entity_type, document_id],
        )
        .map_err(|_| "Không thể hạ mục mồ côi thành tombstone.".to_string())?;
    Ok(())
}

macro_rules! export_repertoire_entity {
    ($name:ident, $entity:literal, $reader:ident, $change:ident, $error:literal) => {
        pub(crate) fn $name(connection: &Connection) -> Result<Vec<$change>, String> {
            pending_rows(connection, $entity)?
                .into_iter()
                .map(|(document_id, generation, attempts, operation)| {
                    let mut deleted = operation == "delete";
                    let data = if deleted {
                        None
                    } else {
                        $reader(connection, &document_id).map_err(|_| $error.to_string())?
                    };
                    if !deleted && data.is_none() {
                        demote_missing_to_tombstone(connection, $entity, &document_id)?;
                        deleted = true;
                    }
                    Ok($change {
                        document_id,
                        generation,
                        attempts,
                        deleted,
                        data,
                    })
                })
                .collect()
        }
    };
}

export_repertoire_entity!(
    export_repertoires,
    "repertoire",
    cloud_repertoire,
    CloudPendingRepertoireChange,
    "Không thể đọc repertoire đang chờ đồng bộ."
);
export_repertoire_entity!(
    export_repertoire_nodes,
    "repertoire_node",
    cloud_repertoire_node,
    CloudPendingRepertoireNodeChange,
    "Không thể đọc node repertoire đang chờ đồng bộ."
);
export_repertoire_entity!(
    export_repertoire_progress,
    "repertoire_progress",
    cloud_repertoire_progress,
    CloudPendingRepertoireProgressChange,
    "Không thể đọc tiến độ repertoire đang chờ đồng bộ."
);
