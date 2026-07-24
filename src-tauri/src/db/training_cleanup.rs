use crate::*;

fn remove_training_cards(
    connection: &Connection,
    condition: &str,
    value: &dyn rusqlite::ToSql,
    queue_deletes: bool,
) -> Result<(), String> {
    let query = format!("SELECT id FROM training_cards WHERE {condition} = ?1");
    let mut statement = connection
        .prepare(&query)
        .map_err(|_| "Không thể chuẩn bị dọn bài tập.".to_string())?;
    let card_ids = statement
        .query_map([value], |row| row.get::<_, String>(0))
        .map_err(|_| "Không thể đọc bài tập cần dọn.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Danh sách bài tập cần dọn không hợp lệ.".to_string())?;
    drop(statement);
    for card_id in card_ids {
        connection
            .execute(
                "DELETE FROM cloud_sync_queue
                 WHERE entity_type = 'training_attempt'
                   AND entity_id IN (
                     SELECT cloud_id FROM training_attempts WHERE card_id = ?1
                   )",
                params![&card_id],
            )
            .map_err(|_| "Không thể dọn hàng đợi lịch sử luyện.".to_string())?;
        connection
            .execute(
                "DELETE FROM training_attempts WHERE card_id = ?1",
                params![&card_id],
            )
            .map_err(|_| "Không thể xoá lịch sử luyện.".to_string())?;
        connection
            .execute(
                "DELETE FROM training_progress_inbox WHERE card_id = ?1",
                params![&card_id],
            )
            .map_err(|_| "Không thể xoá tiến độ cloud đang chờ.".to_string())?;
        connection
            .execute(
                "DELETE FROM training_cards WHERE id = ?1",
                params![&card_id],
            )
            .map_err(|_| "Không thể xoá training card.".to_string())?;
        if queue_deletes {
            queue_cloud_change(connection, "training_progress", &card_id, "delete")
                .map_err(|_| "Không thể xếp thao tác xoá tiến độ cloud.".to_string())?;
        }
    }
    Ok(())
}

pub(crate) fn remove_training_for_game(
    connection: &Connection,
    game_id: &str,
    queue_deletes: bool,
) -> Result<(), String> {
    remove_training_cards(connection, "game_id", &game_id, queue_deletes)
}

pub(crate) fn remove_training_for_profile(
    connection: &Connection,
    profile_id: i64,
    queue_deletes: bool,
) -> Result<(), String> {
    remove_training_cards(connection, "profile_id", &profile_id, queue_deletes)
}
