use crate::*;
use rusqlite::Transaction;

/// Xoá repertoire theo tombstone từ cloud. Không enqueue gì: xoá đã được thiết bị
/// khác truyền tới, enqueue lại sẽ tạo echo loop.
pub(crate) fn delete_repertoire_locally(
    transaction: &Transaction<'_>,
    repertoire_id: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM repertoire_progress WHERE node_id IN
               (SELECT id FROM repertoire_nodes WHERE repertoire_id = ?1)",
            params![repertoire_id],
        )
        .map_err(|_| "Không thể xoá tiến độ repertoire cloud.".to_string())?;
    transaction
        .execute(
            "DELETE FROM cloud_sync_queue
             WHERE entity_type IN ('repertoire_node', 'repertoire_progress')
               AND entity_id IN (SELECT id FROM repertoire_nodes WHERE repertoire_id = ?1)",
            params![repertoire_id],
        )
        .map_err(|_| "Không thể dọn hàng đợi node repertoire.".to_string())?;
    transaction
        .execute(
            "DELETE FROM repertoire_nodes WHERE repertoire_id = ?1",
            params![repertoire_id],
        )
        .map_err(|_| "Không thể xoá node repertoire cloud.".to_string())?;
    transaction
        .execute("DELETE FROM repertoires WHERE id = ?1", params![repertoire_id])
        .map_err(|_| "Không thể xoá repertoire cloud.".to_string())?;
    transaction
        .execute(
            "DELETE FROM cloud_sync_queue
             WHERE entity_type = 'repertoire' AND entity_id = ?1",
            params![repertoire_id],
        )
        .map_err(|_| "Không thể dọn hàng đợi repertoire.".to_string())?;
    transaction
        .execute(
            "DELETE FROM repertoire_node_inbox WHERE repertoire_cloud_id = ?1",
            params![repertoire_id],
        )
        .map_err(|_| "Không thể dọn inbox node repertoire.".to_string())?;
    transaction
        .execute(
            "DELETE FROM repertoire_progress_inbox WHERE repertoire_cloud_id = ?1",
            params![repertoire_id],
        )
        .map_err(|_| "Không thể dọn inbox tiến độ repertoire.".to_string())?;
    Ok(())
}

pub(crate) fn delete_node_locally(
    transaction: &Transaction<'_>,
    node_id: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM repertoire_progress WHERE node_id = ?1",
            params![node_id],
        )
        .map_err(|_| "Không thể xoá tiến độ node repertoire.".to_string())?;
    transaction
        .execute("DELETE FROM repertoire_nodes WHERE id = ?1", params![node_id])
        .map_err(|_| "Không thể xoá node repertoire.".to_string())?;
    transaction
        .execute(
            "DELETE FROM cloud_sync_queue
             WHERE entity_type IN ('repertoire_node', 'repertoire_progress')
               AND entity_id = ?1",
            params![node_id],
        )
        .map_err(|_| "Không thể dọn hàng đợi node repertoire.".to_string())?;
    transaction
        .execute(
            "DELETE FROM repertoire_node_inbox WHERE cloud_id = ?1",
            params![node_id],
        )
        .map_err(|_| "Không thể dọn inbox node repertoire.".to_string())?;
    transaction
        .execute(
            "DELETE FROM repertoire_progress_inbox WHERE node_cloud_id = ?1",
            params![node_id],
        )
        .map_err(|_| "Không thể dọn inbox tiến độ repertoire.".to_string())?;
    Ok(())
}

pub(crate) fn delete_progress_locally(
    transaction: &Transaction<'_>,
    node_id: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM repertoire_progress WHERE node_id = ?1",
            params![node_id],
        )
        .map_err(|_| "Không thể xoá tiến độ repertoire.".to_string())?;
    transaction
        .execute(
            "DELETE FROM cloud_sync_queue
             WHERE entity_type = 'repertoire_progress' AND entity_id = ?1",
            params![node_id],
        )
        .map_err(|_| "Không thể dọn hàng đợi tiến độ repertoire.".to_string())?;
    transaction
        .execute(
            "DELETE FROM repertoire_progress_inbox WHERE node_cloud_id = ?1",
            params![node_id],
        )
        .map_err(|_| "Không thể dọn inbox tiến độ repertoire.".to_string())?;
    Ok(())
}

/// Dọn repertoire khi xoá hồ sơ.
///
/// BẮT BUỘC phải gọi: nếu để repertoire mồ côi, `cloud_repertoire` không JOIN được
/// `player_profiles` để dựng `profile_key`, export trả lỗi và khoá toàn bộ sync.
///
/// `queue_deletes = true` cho đường xoá local (cần truyền tombstone lên cloud);
/// `false` cho đường tombstone đến từ cloud (thiết bị khác đã truyền xoá rồi).
pub(crate) fn remove_repertoires_for_profile(
    transaction: &Transaction<'_>,
    profile_id: i64,
    queue_deletes: bool,
) -> Result<(), String> {
    let repertoire_ids = {
        let mut statement = transaction
            .prepare("SELECT id FROM repertoires WHERE profile_id = ?1")
            .map_err(|_| "Không thể đọc repertoire của hồ sơ.".to_string())?;
        let ids = statement
            .query_map(params![profile_id], |row| row.get::<_, String>(0))
            .map_err(|_| "Không thể đọc repertoire của hồ sơ.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Dữ liệu repertoire của hồ sơ không hợp lệ.".to_string())?;
        ids
    };
    for repertoire_id in &repertoire_ids {
        let node_ids = {
            let mut statement = transaction
                .prepare("SELECT id FROM repertoire_nodes WHERE repertoire_id = ?1")
                .map_err(|_| "Không thể đọc node repertoire của hồ sơ.".to_string())?;
            let ids = statement
                .query_map(params![repertoire_id], |row| row.get::<_, String>(0))
                .map_err(|_| "Không thể đọc node repertoire của hồ sơ.".to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "Dữ liệu node repertoire không hợp lệ.".to_string())?;
            ids
        };
        let progress_ids = {
            let mut statement = transaction
                .prepare(
                    "SELECT p.node_id FROM repertoire_progress p
                     JOIN repertoire_nodes n ON n.id = p.node_id
                     WHERE n.repertoire_id = ?1",
                )
                .map_err(|_| "Không thể đọc tiến độ repertoire của hồ sơ.".to_string())?;
            let ids = statement
                .query_map(params![repertoire_id], |row| row.get::<_, String>(0))
                .map_err(|_| "Không thể đọc tiến độ repertoire của hồ sơ.".to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "Dữ liệu tiến độ repertoire không hợp lệ.".to_string())?;
            ids
        };
        delete_repertoire_locally(transaction, repertoire_id)?;
        if !queue_deletes {
            continue;
        }
        for node_id in &progress_ids {
            queue_cloud_change(transaction, "repertoire_progress", node_id, "delete")
                .map_err(|_| "Không thể xếp tombstone tiến độ repertoire.".to_string())?;
        }
        for node_id in &node_ids {
            queue_cloud_change(transaction, "repertoire_node", node_id, "delete")
                .map_err(|_| "Không thể xếp tombstone node repertoire.".to_string())?;
        }
        queue_cloud_change(transaction, "repertoire", repertoire_id, "delete")
            .map_err(|_| "Không thể xếp tombstone repertoire.".to_string())?;
    }
    Ok(())
}
