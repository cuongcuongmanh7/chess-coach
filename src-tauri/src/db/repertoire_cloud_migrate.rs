use crate::*;

/// Đổi `repertoires.id` từ `randomblob(16)` sang doc id deterministic để hai thiết
/// bị cùng sinh ra một id cho cùng (hồ sơ, màu, family), rồi seed hàng đợi cloud.
///
/// Bỏ qua hoàn toàn nếu chưa có repertoire nào — máy mới không trả giá gì. Dùng
/// delete-and-reinsert thay vì `UPDATE` in-place vì các bản trùng cùng gộp về một
/// id, nên update tại chỗ sẽ đụng primary key tạm thời.
pub(crate) fn rewrite_repertoire_identity(connection: &Connection) -> rusqlite::Result<()> {
    let total: i64 =
        connection.query_row("SELECT COUNT(*) FROM repertoires", [], |row| row.get(0))?;
    if total == 0 {
        return Ok(());
    }
    let transaction = connection.unchecked_transaction()?;
    let plan = plan_repertoire_rewrite(&transaction)?;
    transaction.execute_batch(
        "DELETE FROM repertoire_progress;
         DELETE FROM repertoire_nodes;
         DELETE FROM repertoires;",
    )?;
    for item in plan.repertoires.values() {
        transaction.execute(
            "INSERT INTO repertoires
               (id, profile_id, color, name, eco, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.new_id,
                item.profile_id,
                item.color,
                item.name,
                item.eco,
                item.source,
                item.created_at,
                item.updated_at,
            ],
        )?;
        queue_cloud_change(&transaction, "repertoire", &item.new_id, "upsert")?;
    }
    for item in plan.nodes.values() {
        transaction.execute(
            "INSERT INTO repertoire_nodes
               (id, repertoire_id, parent_id, position_key, fen, move_san, move_uci,
                side_to_move, is_user_move, source, frequency, avg_cpl, comment,
                created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                item.new_id,
                item.new_repertoire_id,
                item.new_parent_id,
                item.payload.position_key,
                item.payload.fen,
                item.payload.move_san,
                item.payload.move_uci,
                item.payload.side_to_move,
                item.payload.is_user_move,
                item.payload.source,
                item.payload.frequency,
                item.payload.avg_cpl,
                item.payload.comment,
                item.created_at,
                item.updated_at,
            ],
        )?;
        queue_cloud_change(&transaction, "repertoire_node", &item.new_id, "upsert")?;
    }
    for item in plan.progress.values() {
        transaction.execute(
            "INSERT INTO repertoire_progress
               (node_id, profile_id, correct_count, wrong_count, correct_streak, status,
                interval_days, due_at, last_correct_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                item.node_id,
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
        )?;
        queue_cloud_change(&transaction, "repertoire_progress", &item.node_id, "upsert")?;
    }
    transaction.commit()
}
