use crate::*;

/// Chuẩn hóa tên repertoire về "family key" — phần trước dấu `:`, lower + trim.
///
/// ĐÂY LÀ WIRE CONTRACT của cloud: `repertoire_doc_id` được derive từ giá trị này,
/// nên đổi cách chuẩn hóa đồng nghĩa re-key toàn bộ document trên Firestore và
/// phải kèm bump `schemaVersion` + migration re-key. Không sửa tại chỗ.
pub(crate) fn repertoire_family_key(name: &str) -> String {
    repertoire_family_name(name).to_lowercase()
}

/// Tên family giữ nguyên chữ hoa/thường để hiển thị.
pub(crate) fn repertoire_family_name(name: &str) -> &str {
    name.split_once(':')
        .map_or(name, |(family, _)| family)
        .trim()
}

/// Khóa hồ sơ dạng `platform:username_lower`.
///
/// Chú ý: khác với `profile_cloud_key` (dùng `_`) vốn là document id của collection
/// `profiles`. Dạng dấu `:` ở đây khớp với `training_card_id` và `cloud_training_attempt`.
pub(crate) fn repertoire_profile_key(platform: &str, username: &str) -> String {
    format!("{platform}:{}", username.trim().to_ascii_lowercase())
}

/// Doc id ổn định giữa các thiết bị cho một repertoire.
pub(crate) fn repertoire_doc_id(profile_key: &str, color: &str, family_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("repertoire:{profile_key}:{color}:{family_key}"));
    format!("{:x}", hasher.finalize())
}

/// Doc id của repertoire theo `profile_id` local, đọc `platform`/`username` từ DB.
pub(crate) fn repertoire_doc_id_for_profile(
    connection: &Connection,
    profile_id: i64,
    color: &str,
    name: &str,
) -> Result<String, String> {
    let (platform, username): (String, String) = connection
        .query_row(
            "SELECT platform, username FROM player_profiles WHERE id = ?1",
            params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Hồ sơ không tồn tại.".to_string())?;
    let profile_key = repertoire_profile_key(&platform, &username);
    Ok(repertoire_doc_id(
        &profile_key,
        color,
        &repertoire_family_key(name),
    ))
}

pub(crate) const REPERTOIRE_INBOX_LIMIT: i64 = 250_000;

pub(crate) fn migrate_to_v9(connection: &Connection) -> rusqlite::Result<()> {
    // repertoire_nodes chỉ có created_at ở v8; LWW merge cần updated_at.
    add_column_if_missing(
        connection,
        "repertoire_nodes",
        "updated_at",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    connection.execute(
        "UPDATE repertoire_nodes SET updated_at = created_at WHERE updated_at = ''",
        [],
    )?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS repertoire_node_inbox (
            cloud_id TEXT PRIMARY KEY,
            repertoire_cloud_id TEXT NOT NULL,
            node_key TEXT NOT NULL,
            parent_node_key TEXT,
            position_key TEXT NOT NULL,
            fen TEXT NOT NULL,
            move_san TEXT NOT NULL,
            move_uci TEXT NOT NULL,
            side_to_move TEXT NOT NULL,
            is_user_move INTEGER NOT NULL,
            source TEXT NOT NULL,
            frequency INTEGER NOT NULL DEFAULT 0,
            avg_cpl REAL,
            comment TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_repertoire_node_inbox_rep
         ON repertoire_node_inbox(repertoire_cloud_id);
         CREATE TABLE IF NOT EXISTS repertoire_progress_inbox (
            node_cloud_id TEXT PRIMARY KEY,
            repertoire_cloud_id TEXT NOT NULL,
            profile_key TEXT NOT NULL,
            correct_count INTEGER NOT NULL DEFAULT 0,
            wrong_count INTEGER NOT NULL DEFAULT 0,
            correct_streak INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'new',
            interval_days INTEGER NOT NULL DEFAULT 0,
            due_at TEXT NOT NULL,
            last_correct_at TEXT,
            updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_repertoire_progress_inbox_rep
         ON repertoire_progress_inbox(repertoire_cloud_id);",
    )?;
    rewrite_repertoire_identity(connection)?;
    // Đặt sau phần rewrite: dữ liệu v8 có thể còn vi phạm invariant này.
    connection.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_repertoire_nodes_key
         ON repertoire_nodes(repertoire_id, position_key, move_uci);",
    )?;
    connection.execute_batch("PRAGMA user_version = 9;")
}
