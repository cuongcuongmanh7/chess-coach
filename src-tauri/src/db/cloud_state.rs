use crate::*;

pub(crate) fn load_cloud_cursor(
    connection: &Connection,
    uid: &str,
    collection: &str,
) -> rusqlite::Result<CloudSyncCursor> {
    connection
        .query_row(
            "SELECT initialized, updated_at_seconds, updated_at_nanoseconds, document_id
             FROM cloud_sync_cursors
             WHERE uid = ?1 AND collection_name = ?2",
            params![uid, collection],
            |row| {
                Ok(CloudSyncCursor {
                    initialized: row.get::<_, i64>(0)? != 0,
                    updated_at_seconds: row.get(1)?,
                    updated_at_nanoseconds: row.get(2)?,
                    document_id: row.get(3)?,
                })
            },
        )
        .optional()
        .map(|cursor| cursor.unwrap_or_default())
}

pub(crate) fn get_cloud_sync_cursors(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
) -> Result<CloudSyncCursors, String> {
    if uid.trim().is_empty() || uid.len() > 128 {
        return Err("Firebase UID không hợp lệ.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở trạng thái đồng bộ.".to_string())?;
    Ok(CloudSyncCursors {
        profiles: load_cloud_cursor(&connection, &uid, "profiles")
            .map_err(|_| "Không thể đọc con trỏ hồ sơ cloud.".to_string())?,
        games: load_cloud_cursor(&connection, &uid, "games")
            .map_err(|_| "Không thể đọc con trỏ ván cloud.".to_string())?,
    })
}

pub(crate) fn save_cloud_cursor(
    connection: &Connection,
    uid: &str,
    collection: &str,
    cursor: &CloudSyncCursor,
) -> rusqlite::Result<()> {
    connection.execute(
        "INSERT INTO cloud_sync_cursors
         (uid, collection_name, initialized, updated_at_seconds, updated_at_nanoseconds, document_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(uid, collection_name) DO UPDATE SET
           initialized = excluded.initialized,
           updated_at_seconds = excluded.updated_at_seconds,
           updated_at_nanoseconds = excluded.updated_at_nanoseconds,
           document_id = excluded.document_id",
        params![
            uid,
            collection,
            i64::from(cursor.initialized),
            cursor.updated_at_seconds,
            cursor.updated_at_nanoseconds,
            cursor.document_id,
        ],
    )?;
    Ok(())
}

pub(crate) fn set_cloud_sync_cursors(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
    cursors: CloudSyncCursors,
) -> Result<(), String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở trạng thái đồng bộ.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể lưu con trỏ đồng bộ.".to_string())?;
    save_cloud_cursor(&transaction, &uid, "profiles", &cursors.profiles)
        .map_err(|_| "Không thể lưu con trỏ hồ sơ cloud.".to_string())?;
    save_cloud_cursor(&transaction, &uid, "games", &cursors.games)
        .map_err(|_| "Không thể lưu con trỏ ván cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu con trỏ cloud.".to_string())
}

pub(crate) fn acknowledge_cloud_changes_connection(
    connection: &mut Connection,
    changes: Vec<CloudAckToken>,
) -> Result<usize, String> {
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể xác nhận hàng đợi cloud.".to_string())?;
    for change in changes {
        if !matches!(change.entity_type.as_str(), "profile" | "game") {
            return Err("Loại thay đổi cloud không hợp lệ.".to_string());
        }
        transaction
            .execute(
                "DELETE FROM cloud_sync_queue
                 WHERE entity_type = ?1 AND entity_id = ?2 AND generation = ?3",
                params![change.entity_type, change.entity_id, change.generation],
            )
            .map_err(|_| "Không thể xác nhận thay đổi đã tải lên.".to_string())?;
    }
    let remaining: i64 = transaction
        .query_row("SELECT COUNT(*) FROM cloud_sync_queue", [], |row| {
            row.get(0)
        })
        .map_err(|_| "Không thể đếm hàng đợi cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất xác nhận cloud.".to_string())?;
    Ok(remaining.max(0) as usize)
}

pub(crate) fn acknowledge_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
    changes: Vec<CloudAckToken>,
) -> Result<usize, String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở hàng đợi cloud.".to_string())?;
    acknowledge_cloud_changes_connection(&mut connection, changes)
}

pub(crate) fn mark_cloud_changes_failed_connection(
    connection: &Connection,
    changes: Vec<CloudAckToken>,
    error: String,
) -> Result<(), String> {
    let message: String = error.chars().take(500).collect();
    for change in changes {
        connection
            .execute(
                "UPDATE cloud_sync_queue
                 SET attempts = attempts + 1,
                     next_retry_at = datetime('now', '+' || MIN(300, (attempts + 1) * (attempts + 1) * 2) || ' seconds'),
                     last_error = ?4
                 WHERE entity_type = ?1 AND entity_id = ?2 AND generation = ?3",
                params![
                    change.entity_type,
                    change.entity_id,
                    change.generation,
                    &message
                ],
            )
            .map_err(|_| "Không thể lưu trạng thái retry cloud.".to_string())?;
    }
    Ok(())
}

pub(crate) fn mark_cloud_changes_failed(
    database: tauri::State<'_, DatabaseState>,
    changes: Vec<CloudAckToken>,
    error: String,
) -> Result<(), String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở hàng đợi cloud.".to_string())?;
    mark_cloud_changes_failed_connection(&connection, changes, error)
}
