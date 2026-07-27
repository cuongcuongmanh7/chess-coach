use crate::*;

pub(crate) fn save_repertoire_connection(
    connection: &mut Connection,
    request: SaveRepertoireRequest,
) -> Result<SaveRepertoireResult, String> {
    let plan = build_save_plan(connection, &request)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu lưu repertoire.".to_string())?;

    // Đọc tiến độ của bản trùng trước khi xoá, rồi mới gộp vào survivor.
    let carried = read_carried_progress(&transaction, &plan.loser_ids)?;
    remove_duplicate_repertoires(&transaction, &plan.loser_ids)?;

    transaction
        .execute(
            "INSERT INTO repertoires
               (id, profile_id, color, name, eco, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'history',
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               eco = excluded.eco,
               source = excluded.source,
               updated_at = excluded.updated_at",
            params![
                plan.repertoire_id,
                request.profile_id,
                request.color,
                plan.family_name,
                request.eco,
            ],
        )
        .map_err(|_| "Không thể lưu repertoire.".to_string())?;

    let changed_node_ids = upsert_nodes(&transaction, &plan, &request)?;
    tombstone_stale_nodes(&transaction, &plan.stale_node_ids)?;
    let carried_node_ids = apply_carried_progress(&transaction, &plan.repertoire_id, &carried)?;

    queue_cloud_change(
        &transaction,
        "repertoire",
        &plan.repertoire_id,
        "upsert",
    )
    .map_err(|_| "Không thể xếp repertoire vào hàng đợi cloud.".to_string())?;
    queue_repertoire_upserts(&transaction, "repertoire_node", &changed_node_ids)?;
    queue_repertoire_upserts(&transaction, "repertoire_progress", &carried_node_ids)?;

    // Node vừa được tạo local có thể giải phóng doc đang chờ trong inbox.
    drain_repertoire_inbox(&transaction)?;

    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu repertoire.".to_string())?;
    Ok(SaveRepertoireResult {
        repertoire_id: plan.repertoire_id,
        node_count: request.nodes.len(),
    })
}

/// Upsert từng node và chỉ trả về id của node THỰC SỰ thay đổi.
///
/// Guard trong `WHERE` là bắt buộc: trainer tự dựng cả hai màu mỗi lần mở, nên nếu
/// upsert vô điều kiện thì mỗi lần mở sẽ đẩy tới 5.000 node vào hàng đợi cloud.
fn upsert_nodes(
    transaction: &rusqlite::Transaction<'_>,
    plan: &RepertoireSavePlan,
    request: &SaveRepertoireRequest,
) -> Result<Vec<String>, String> {
    let mut changed = Vec::new();
    for seed in &request.nodes {
        let node_id = plan
            .key_to_id
            .get(&seed.node_key)
            .ok_or_else(|| "Không thể ánh xạ node.".to_string())?;
        let parent_id = seed
            .parent_key
            .as_ref()
            .map(|key| {
                plan.key_to_id
                    .get(key)
                    .cloned()
                    .ok_or_else(|| "Không tìm thấy node cha.".to_string())
            })
            .transpose()?;
        let rows = transaction
            .execute(
                "INSERT INTO repertoire_nodes
                 (id, repertoire_id, parent_id, position_key, fen, move_san, move_uci,
                  side_to_move, is_user_move, source, frequency, avg_cpl, comment,
                  created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT(id) DO UPDATE SET
                   parent_id = excluded.parent_id,
                   fen = excluded.fen,
                   move_san = excluded.move_san,
                   side_to_move = excluded.side_to_move,
                   is_user_move = excluded.is_user_move,
                   source = excluded.source,
                   frequency = excluded.frequency,
                   avg_cpl = excluded.avg_cpl,
                   comment = COALESCE(excluded.comment, repertoire_nodes.comment),
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE repertoire_nodes.frequency <> excluded.frequency
                    OR repertoire_nodes.avg_cpl IS NOT excluded.avg_cpl
                    OR repertoire_nodes.parent_id IS NOT excluded.parent_id
                    OR repertoire_nodes.move_san <> excluded.move_san
                    OR repertoire_nodes.is_user_move <> excluded.is_user_move
                    OR repertoire_nodes.source <> excluded.source",
                params![
                    node_id,
                    plan.repertoire_id,
                    parent_id,
                    seed.position_key,
                    seed.fen,
                    seed.move_san,
                    seed.move_uci,
                    seed.side_to_move,
                    i64::from(seed.is_user_move),
                    seed.source,
                    seed.frequency,
                    seed.avg_cpl,
                    seed.comment,
                ],
            )
            .map_err(|_| "Không thể lưu node repertoire.".to_string())?;
        if rows > 0 {
            changed.push(node_id.clone());
        }
    }
    Ok(changed)
}
