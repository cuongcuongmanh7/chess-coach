use crate::*;
use rusqlite::Transaction;

fn valid_progress(progress: &CloudTrainingProgress, document_id: &str) -> bool {
    progress.card_id == document_id
        && document_id.len() == 64
        && document_id.chars().all(|value| value.is_ascii_hexdigit())
        && matches!(
            progress.status.as_str(),
            "new" | "learning" | "review" | "mastered"
        )
        && progress.interval_days <= 90
        && progress.lapses <= progress.attempts
        && progress.due_at.len() <= 64
        && progress.updated_at.len() <= 64
}

pub(crate) fn merge_training_progress(
    transaction: &Transaction<'_>,
    changes: &[CloudRemoteTrainingProgressChange],
) -> Result<usize, String> {
    if changes.len() > 50_000 {
        return Err("Tiến độ luyện trên cloud vượt quá giới hạn an toàn.".to_string());
    }
    let mut merged = 0usize;
    for change in changes {
        if !valid_cloud_document_id(&change.document_id) || change.document_id.len() != 64 {
            // Bỏ qua doc có mã không hợp lệ (artifact cũ trên cloud) thay vì
            // abort cả batch — tránh "poison pill" khiến sync kẹt vĩnh viễn.
            continue;
        }
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'training_progress' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận tiến độ đã xoá trên cloud.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM training_progress_inbox WHERE card_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá tiến độ cloud đang chờ.".to_string())?;
            continue;
        }
        let Some(progress) = change.data.as_ref() else {
            // Doc không xoá nhưng thiếu dữ liệu: bỏ qua thay vì làm hỏng cả batch.
            continue;
        };
        if !valid_progress(progress, &change.document_id) {
            // Doc cũ/không hợp lệ trên cloud: bỏ qua để cursor tiến tiếp,
            // tránh retry vô hạn cùng một doc lỗi.
            continue;
        }
        if pending_cloud_operation(transaction, "training_progress", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột tiến độ local.".to_string())?
            .is_some()
        {
            continue;
        }
        let updated = transaction
            .execute(
                "UPDATE training_cards SET
                   status = ?2, due_at = ?3, interval_days = ?4, correct_streak = ?5,
                   attempts = MAX(attempts, ?6), lapses = MAX(lapses, ?7),
                   starred = ?8, suspended = ?9,
                   last_correct_at = CASE
                     WHEN ?10 IS NOT NULL
                       AND (last_correct_at IS NULL OR ?10 > last_correct_at) THEN ?10
                     ELSE last_correct_at
                   END,
                   updated_at = ?11
                 WHERE id = ?1 AND updated_at < ?11",
                params![
                    &progress.card_id,
                    &progress.status,
                    &progress.due_at,
                    progress.interval_days,
                    progress.correct_streak,
                    progress.attempts,
                    progress.lapses,
                    progress.starred,
                    progress.suspended,
                    &progress.last_correct_at,
                    &progress.updated_at,
                ],
            )
            .map_err(|_| "Không thể áp dụng tiến độ luyện cloud.".to_string())?;
        if updated > 0 {
            merged += 1;
            continue;
        }
        let card_exists = transaction
            .query_row(
                "SELECT 1 FROM training_cards WHERE id = ?1",
                params![&progress.card_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|_| "Không thể kiểm tra training card local.".to_string())?
            .is_some();
        if card_exists {
            continue;
        }
        transaction
            .execute(
                "INSERT INTO training_progress_inbox
                 (card_id, status, due_at, interval_days, correct_streak, attempts,
                  lapses, starred, suspended, last_correct_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(card_id) DO UPDATE SET
                   status = excluded.status,
                   due_at = excluded.due_at,
                   interval_days = excluded.interval_days,
                   correct_streak = excluded.correct_streak,
                   attempts = MAX(training_progress_inbox.attempts, excluded.attempts),
                   lapses = MAX(training_progress_inbox.lapses, excluded.lapses),
                   starred = excluded.starred,
                   suspended = excluded.suspended,
                   last_correct_at = CASE
                     WHEN excluded.last_correct_at IS NOT NULL
                       AND (training_progress_inbox.last_correct_at IS NULL
                            OR excluded.last_correct_at > training_progress_inbox.last_correct_at)
                     THEN excluded.last_correct_at
                     ELSE training_progress_inbox.last_correct_at
                   END,
                   updated_at = excluded.updated_at
                 WHERE excluded.updated_at > training_progress_inbox.updated_at",
                params![
                    &progress.card_id,
                    &progress.status,
                    &progress.due_at,
                    progress.interval_days,
                    progress.correct_streak,
                    progress.attempts,
                    progress.lapses,
                    progress.starred,
                    progress.suspended,
                    &progress.last_correct_at,
                    &progress.updated_at,
                ],
            )
            .map_err(|_| "Không thể lưu tiến độ cloud đang chờ.".to_string())?;
        merged += 1;
    }
    Ok(merged)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn progress(card_id: &str) -> CloudTrainingProgress {
        CloudTrainingProgress {
            card_id: card_id.to_string(),
            status: "review".to_string(),
            due_at: "2026-07-30T00:00:00Z".to_string(),
            interval_days: 7,
            correct_streak: 1,
            attempts: 2,
            lapses: 0,
            starred: true,
            suspended: false,
            last_correct_at: None,
            updated_at: "2026-07-23T10:00:00Z".to_string(),
        }
    }

    #[test]
    fn stores_remote_progress_until_card_is_generated() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection, false).unwrap();
        let card_id = "a".repeat(64);
        let transaction = connection.transaction().unwrap();
        let merged = merge_training_progress(
            &transaction,
            &[CloudRemoteTrainingProgressChange {
                document_id: card_id.clone(),
                deleted: false,
                data: Some(progress(&card_id)),
            }],
        )
        .unwrap();
        transaction.commit().unwrap();
        let stored: String = connection
            .query_row(
                "SELECT status FROM training_progress_inbox WHERE card_id = ?1",
                params![card_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(merged, 1);
        assert_eq!(stored, "review");
    }

    #[test]
    fn skips_invalid_remote_progress_without_aborting_batch() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection, false).unwrap();
        let good_id = "a".repeat(64);
        let bad_id = "c".repeat(64);
        let mut bad = progress(&bad_id);
        bad.interval_days = 999; // vượt ngưỡng hợp lệ (<=90)
        let transaction = connection.transaction().unwrap();
        let merged = merge_training_progress(
            &transaction,
            &[
                CloudRemoteTrainingProgressChange {
                    document_id: bad_id.clone(),
                    deleted: false,
                    data: Some(bad),
                },
                CloudRemoteTrainingProgressChange {
                    document_id: good_id.clone(),
                    deleted: false,
                    data: Some(progress(&good_id)),
                },
            ],
        )
        .unwrap();
        transaction.commit().unwrap();
        assert_eq!(merged, 1);
        let good_stored: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM training_progress_inbox WHERE card_id = ?1",
                params![good_id],
                |row| row.get(0),
            )
            .unwrap();
        let bad_stored: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM training_progress_inbox WHERE card_id = ?1",
                params![bad_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(good_stored, 1);
        assert_eq!(bad_stored, 0);
    }

    #[test]
    fn pending_local_progress_wins_over_remote() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection, false).unwrap();
        let card_id = "b".repeat(64);
        queue_cloud_change(&connection, "training_progress", &card_id, "upsert").unwrap();
        let transaction = connection.transaction().unwrap();
        let merged = merge_training_progress(
            &transaction,
            &[CloudRemoteTrainingProgressChange {
                document_id: card_id.clone(),
                deleted: false,
                data: Some(progress(&card_id)),
            }],
        )
        .unwrap();
        transaction.commit().unwrap();
        let stored: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM training_progress_inbox WHERE card_id = ?1",
                params![card_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(merged, 0);
        assert_eq!(stored, 0);
    }
}
