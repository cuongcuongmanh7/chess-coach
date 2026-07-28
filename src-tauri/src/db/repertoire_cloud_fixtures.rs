use crate::*;

pub(crate) fn seed_node(
    key: &str,
    parent: Option<&str>,
    uci: &str,
    is_user: bool,
) -> RepertoireNodeSeed {
    RepertoireNodeSeed {
        node_key: format!("pos-{key}|{uci}"),
        parent_key: parent.map(|value| value.to_string()),
        position_key: format!("pos-{key}"),
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
        move_san: uci.to_string(),
        move_uci: uci.to_string(),
        side_to_move: if is_user { "w" } else { "b" }.to_string(),
        is_user_move: is_user,
        source: "history".to_string(),
        frequency: 3,
        avg_cpl: Some(20.0),
        comment: None,
    }
}

pub(crate) fn cloud_connection() -> Connection {
    let connection = Connection::open_in_memory().unwrap();
    initialize_database(&connection).unwrap();
    connection
        .execute(
            "INSERT INTO player_profiles(id, platform, username, created_at)
             VALUES (1, 'chesscom', 'Learner', datetime('now'))",
            [],
        )
        .unwrap();
    clear_queue(&connection);
    connection
}

pub(crate) fn clear_queue(connection: &Connection) {
    connection
        .execute("DELETE FROM cloud_sync_queue", [])
        .unwrap();
}

pub(crate) fn save_family(
    connection: &mut Connection,
    name: &str,
    nodes: Vec<RepertoireNodeSeed>,
) -> String {
    save_repertoire_connection(
        connection,
        SaveRepertoireRequest {
            profile_id: 1,
            color: "w".to_string(),
            name: name.to_string(),
            eco: Some("C50".to_string()),
            nodes,
        },
    )
    .unwrap()
    .repertoire_id
}

pub(crate) fn queue_operation(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> Option<String> {
    pending_cloud_operation(connection, entity_type, entity_id).unwrap()
}

pub(crate) fn queue_count(connection: &Connection, entity_type: &str, operation: &str) -> i64 {
    connection
        .query_row(
            "SELECT COUNT(*) FROM cloud_sync_queue
             WHERE entity_type = ?1 AND operation = ?2",
            params![entity_type, operation],
            |row| row.get(0),
        )
        .unwrap()
}

pub(crate) fn count(connection: &Connection, sql: &str) -> i64 {
    connection.query_row(sql, [], |row| row.get(0)).unwrap()
}

pub(crate) fn profile_key() -> String {
    repertoire_profile_key("chesscom", "Learner")
}

// --- Dữ liệu v8 để thử đường nâng cấp ---

/// Đưa DB đã ở v9 về hình dạng trước v9: bỏ unique index và hạ `user_version`.
pub(crate) fn downgrade_to_v8(connection: &Connection) {
    connection
        .execute_batch(
            "DROP INDEX IF EXISTS idx_repertoire_nodes_key;
             DELETE FROM repertoire_progress;
             DELETE FROM repertoire_nodes;
             DELETE FROM repertoires;
             DELETE FROM cloud_sync_queue;
             PRAGMA user_version = 8;",
        )
        .unwrap();
}

pub(crate) fn insert_legacy_repertoire(
    connection: &Connection,
    id: &str,
    name: &str,
    updated_at: &str,
) {
    connection
        .execute(
            "INSERT INTO repertoires
               (id, profile_id, color, name, eco, source, created_at, updated_at)
             VALUES (?1, 1, 'w', ?2, 'C50', 'history', ?3, ?3)",
            params![id, name, updated_at],
        )
        .unwrap();
}

/// `updated_at = ''` mô phỏng đúng trạng thái ngay sau `ALTER TABLE ... DEFAULT ''`,
/// để kiểm tra bước backfill của v9.
pub(crate) fn insert_legacy_node(
    connection: &Connection,
    id: &str,
    repertoire_id: &str,
    parent_id: Option<&str>,
    uci: &str,
) {
    connection
        .execute(
            "INSERT INTO repertoire_nodes
               (id, repertoire_id, parent_id, position_key, fen, move_san, move_uci,
                side_to_move, is_user_move, source, frequency, avg_cpl, comment,
                created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'fen', ?5, ?5, 'w', 1, 'history', 5, 10.0, NULL,
                     '2026-01-01T00:00:00.000Z', '')",
            params![id, repertoire_id, parent_id, format!("pos-{uci}"), uci],
        )
        .unwrap();
}

pub(crate) fn insert_legacy_progress(
    connection: &Connection,
    node_id: &str,
    correct: i64,
    updated_at: &str,
) {
    connection
        .execute(
            "INSERT INTO repertoire_progress
               (node_id, profile_id, correct_count, wrong_count, correct_streak, status,
                interval_days, due_at, last_correct_at, updated_at)
             VALUES (?1, 1, ?2, 0, ?2, 'review', 7, '2026-02-01T00:00:00.000Z', NULL, ?3)",
            params![node_id, correct, updated_at],
        )
        .unwrap();
}

// --- Payload cloud ---

pub(crate) fn remote_repertoire(name: &str, updated_at: &str) -> CloudRepertoire {
    let profile_key = profile_key();
    let cloud_id = repertoire_doc_id(&profile_key, "w", &repertoire_family_key(name));
    CloudRepertoire {
        cloud_id,
        profile_key,
        color: "w".to_string(),
        name: name.to_string(),
        eco: Some("C50".to_string()),
        source: "history".to_string(),
        created_at: "2026-01-01T00:00:00.000Z".to_string(),
        updated_at: updated_at.to_string(),
    }
}

pub(crate) fn remote_node(
    repertoire_cloud_id: &str,
    uci: &str,
    parent_uci: Option<&str>,
    updated_at: &str,
) -> CloudRepertoireNode {
    let position_key = format!("pos-{uci}");
    let node_key = format!("{position_key}|{uci}");
    CloudRepertoireNode {
        cloud_id: repertoire_node_id(repertoire_cloud_id, &node_key),
        repertoire_cloud_id: repertoire_cloud_id.to_string(),
        node_key,
        parent_node_key: parent_uci.map(|value| format!("pos-{value}|{value}")),
        position_key,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
        move_san: uci.to_string(),
        move_uci: uci.to_string(),
        side_to_move: "w".to_string(),
        is_user_move: true,
        source: "history".to_string(),
        frequency: 7,
        avg_cpl: Some(15.0),
        comment: None,
        created_at: "2026-01-01T00:00:00.000Z".to_string(),
        updated_at: updated_at.to_string(),
    }
}

pub(crate) fn remote_progress(
    repertoire_cloud_id: &str,
    node_cloud_id: &str,
    correct: i64,
    updated_at: &str,
) -> CloudRepertoireProgress {
    CloudRepertoireProgress {
        node_cloud_id: node_cloud_id.to_string(),
        repertoire_cloud_id: repertoire_cloud_id.to_string(),
        profile_key: profile_key(),
        correct_count: correct,
        wrong_count: 1,
        correct_streak: correct,
        status: "review".to_string(),
        interval_days: 7,
        due_at: "2026-06-01T00:00:00.000Z".to_string(),
        last_correct_at: Some("2026-05-01T00:00:00.000Z".to_string()),
        updated_at: updated_at.to_string(),
    }
}

pub(crate) fn repertoire_upsert(data: CloudRepertoire) -> CloudRemoteRepertoireChange {
    CloudRemoteRepertoireChange {
        document_id: data.cloud_id.clone(),
        deleted: false,
        data: Some(data),
    }
}

pub(crate) fn node_upsert(data: CloudRepertoireNode) -> CloudRemoteRepertoireNodeChange {
    CloudRemoteRepertoireNodeChange {
        document_id: data.cloud_id.clone(),
        deleted: false,
        data: Some(data),
    }
}

pub(crate) fn progress_upsert(
    data: CloudRepertoireProgress,
) -> CloudRemoteRepertoireProgressChange {
    CloudRemoteRepertoireProgressChange {
        document_id: data.node_cloud_id.clone(),
        deleted: false,
        data: Some(data),
    }
}
