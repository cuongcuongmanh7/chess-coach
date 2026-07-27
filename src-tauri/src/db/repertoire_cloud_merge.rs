use crate::*;
use rusqlite::Transaction;

pub(crate) struct RepertoireMergeCounts {
    pub(crate) repertoires: usize,
    pub(crate) nodes: usize,
    pub(crate) progress: usize,
}

const MAX_REMOTE_REPERTOIRES: usize = 2_000;
const MAX_REMOTE_NODES: usize = 200_000;
const MAX_REMOTE_PROGRESS: usize = 200_000;

pub(crate) fn merge_repertoire_cloud(
    transaction: &Transaction<'_>,
    request: &MergeCloudChangesRequest,
) -> Result<RepertoireMergeCounts, String> {
    if request.repertoires.len() > MAX_REMOTE_REPERTOIRES
        || request.repertoire_nodes.len() > MAX_REMOTE_NODES
        || request.repertoire_progress.len() > MAX_REMOTE_PROGRESS
    {
        return Err("Dữ liệu repertoire trên cloud vượt quá giới hạn an toàn.".to_string());
    }
    let repertoires = merge_repertoires(transaction, &request.repertoires)?;
    let nodes = merge_nodes(transaction, &request.repertoire_nodes)?;
    let progress = merge_progress(transaction, &request.repertoire_progress)?;
    drain_repertoire_inbox(transaction)?;
    Ok(RepertoireMergeCounts {
        repertoires,
        nodes,
        progress,
    })
}

fn merge_repertoires(
    transaction: &Transaction<'_>,
    changes: &[CloudRemoteRepertoireChange],
) -> Result<usize, String> {
    let mut merged = 0;
    for change in changes {
        if !valid_hex_id(&change.document_id) {
            continue;
        }
        if pending_cloud_operation(transaction, "repertoire", &change.document_id)
            .map_err(|_| "Không thể đọc hàng đợi repertoire.".to_string())?
            .is_some()
        {
            continue;
        }
        if change.deleted {
            delete_repertoire_locally(transaction, &change.document_id)?;
            merged += 1;
            continue;
        }
        let Some(data) = change.data.as_ref() else {
            continue;
        };
        if !valid_repertoire(data, &change.document_id) {
            continue;
        }
        let Some(profile_id) = resolve_profile_id(transaction, &data.profile_key)? else {
            continue;
        };
        transaction
            .execute(
                "INSERT INTO repertoires
                   (id, profile_id, color, name, eco, source, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   eco = excluded.eco,
                   source = excluded.source,
                   created_at = MIN(repertoires.created_at, excluded.created_at),
                   updated_at = excluded.updated_at
                 WHERE excluded.updated_at > repertoires.updated_at",
                params![
                    data.cloud_id,
                    profile_id,
                    data.color,
                    data.name,
                    data.eco,
                    data.source,
                    data.created_at,
                    data.updated_at,
                ],
            )
            .map_err(|_| "Không thể hợp nhất repertoire cloud.".to_string())?;
        merged += 1;
    }
    Ok(merged)
}

fn merge_nodes(
    transaction: &Transaction<'_>,
    changes: &[CloudRemoteRepertoireNodeChange],
) -> Result<usize, String> {
    let mut merged = 0;
    for change in changes {
        if !valid_hex_id(&change.document_id) {
            continue;
        }
        if pending_cloud_operation(transaction, "repertoire_node", &change.document_id)
            .map_err(|_| "Không thể đọc hàng đợi node repertoire.".to_string())?
            .is_some()
        {
            continue;
        }
        if change.deleted {
            delete_node_locally(transaction, &change.document_id)?;
            merged += 1;
            continue;
        }
        let Some(data) = change.data.as_ref() else {
            continue;
        };
        if !valid_node(data, &change.document_id) {
            continue;
        }
        let repertoire_exists: bool = transaction
            .query_row(
                "SELECT 1 FROM repertoires WHERE id = ?1",
                params![data.repertoire_cloud_id],
                |_| Ok(true),
            )
            .optional()
            .map_err(|_| "Không thể kiểm tra repertoire.".to_string())?
            .unwrap_or(false);
        if repertoire_exists {
            apply_remote_node(transaction, data)?;
        } else {
            store_node_inbox(transaction, data)?;
        }
        merged += 1;
    }
    Ok(merged)
}

fn merge_progress(
    transaction: &Transaction<'_>,
    changes: &[CloudRemoteRepertoireProgressChange],
) -> Result<usize, String> {
    let mut merged = 0;
    for change in changes {
        if !valid_hex_id(&change.document_id) {
            continue;
        }
        if pending_cloud_operation(transaction, "repertoire_progress", &change.document_id)
            .map_err(|_| "Không thể đọc hàng đợi tiến độ repertoire.".to_string())?
            .is_some()
        {
            continue;
        }
        if change.deleted {
            delete_progress_locally(transaction, &change.document_id)?;
            merged += 1;
            continue;
        }
        let Some(data) = change.data.as_ref() else {
            continue;
        };
        if !valid_progress(data, &change.document_id) {
            continue;
        }
        if !apply_remote_progress(transaction, data)? {
            store_progress_inbox(transaction, data)?;
        }
        merged += 1;
    }
    Ok(merged)
}

/// LWW theo `updated_at`. `parent_id` được derive từ `parent_node_key` nên không
/// cần row cha tồn tại: `repertoire_nodes.parent_id` không có FK, parent lơ lửng
/// được chấp nhận và tự lành khi node cha về.
pub(crate) fn apply_remote_node(
    transaction: &Transaction<'_>,
    data: &CloudRepertoireNode,
) -> Result<(), String> {
    let parent_id = data
        .parent_node_key
        .as_ref()
        .map(|key| repertoire_node_id(&data.repertoire_cloud_id, key));
    transaction
        .execute(
            "INSERT INTO repertoire_nodes
               (id, repertoire_id, parent_id, position_key, fen, move_san, move_uci,
                side_to_move, is_user_move, source, frequency, avg_cpl, comment,
                created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
               parent_id = excluded.parent_id,
               fen = excluded.fen,
               move_san = excluded.move_san,
               side_to_move = excluded.side_to_move,
               is_user_move = excluded.is_user_move,
               source = excluded.source,
               frequency = excluded.frequency,
               avg_cpl = excluded.avg_cpl,
               comment = excluded.comment,
               created_at = MIN(repertoire_nodes.created_at, excluded.created_at),
               updated_at = excluded.updated_at
             WHERE excluded.updated_at > repertoire_nodes.updated_at",
            params![
                data.cloud_id,
                data.repertoire_cloud_id,
                parent_id,
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
        .map_err(|_| "Không thể hợp nhất node repertoire cloud.".to_string())?;
    Ok(())
}

/// Trả `false` khi node tương ứng chưa có ở local — caller đưa doc vào inbox.
pub(crate) fn apply_remote_progress(
    transaction: &Transaction<'_>,
    data: &CloudRepertoireProgress,
) -> Result<bool, String> {
    let profile_id: Option<i64> = transaction
        .query_row(
            "SELECT r.profile_id FROM repertoire_nodes n
             JOIN repertoires r ON r.id = n.repertoire_id
             WHERE n.id = ?1",
            params![data.node_cloud_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Không thể xác định hồ sơ của tiến độ repertoire.".to_string())?;
    let Some(profile_id) = profile_id else {
        return Ok(false);
    };
    transaction
        .execute(
            "INSERT INTO repertoire_progress
               (node_id, profile_id, correct_count, wrong_count, correct_streak, status,
                interval_days, due_at, last_correct_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(node_id) DO UPDATE SET
               correct_count = MAX(repertoire_progress.correct_count, excluded.correct_count),
               wrong_count = MAX(repertoire_progress.wrong_count, excluded.wrong_count),
               correct_streak = excluded.correct_streak,
               status = excluded.status,
               interval_days = excluded.interval_days,
               due_at = excluded.due_at,
               last_correct_at = MAX(COALESCE(repertoire_progress.last_correct_at, ''),
                                     COALESCE(excluded.last_correct_at, '')),
               updated_at = excluded.updated_at
             WHERE excluded.updated_at > repertoire_progress.updated_at",
            params![
                data.node_cloud_id,
                profile_id,
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
        .map_err(|_| "Không thể hợp nhất tiến độ repertoire cloud.".to_string())?;
    Ok(true)
}
