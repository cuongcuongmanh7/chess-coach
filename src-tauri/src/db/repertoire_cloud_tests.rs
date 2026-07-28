use super::repertoire_cloud_fixtures::*;
use crate::*;

// --- Định danh ---

#[test]
fn doc_id_is_stable_and_varies_by_color_family_and_platform() {
    let chesscom = repertoire_profile_key("chesscom", "Learner");
    let lichess = repertoire_profile_key("lichess", "Learner");
    // Cùng đầu vào ở hai "thiết bị" phải cho cùng id.
    assert_eq!(
        repertoire_doc_id(&chesscom, "w", "italian game"),
        repertoire_doc_id(
            &repertoire_profile_key("chesscom", "learner"),
            "w",
            "italian game"
        )
    );
    for other in [
        repertoire_doc_id(&chesscom, "b", "italian game"),
        repertoire_doc_id(&chesscom, "w", "sicilian defense"),
        repertoire_doc_id(&lichess, "w", "italian game"),
    ] {
        assert_ne!(repertoire_doc_id(&chesscom, "w", "italian game"), other);
    }
}

#[test]
fn doc_id_ignores_variation_suffix() {
    // Bảo vệ wire contract: chuẩn hóa family phải khớp giữa Rust và đường ghi local.
    let profile_key = profile_key();
    let base = repertoire_doc_id(&profile_key, "w", &repertoire_family_key("Italian Game"));
    for name in [
        "Italian Game: Giuoco Piano",
        "italian game : Classical Variation",
        "  Italian Game  ",
    ] {
        assert_eq!(
            base,
            repertoire_doc_id(&profile_key, "w", &repertoire_family_key(name)),
            "family key lệch với {name}"
        );
    }
}

// --- Migration v9 ---

#[test]
fn v9_merges_duplicate_families_and_keeps_max_progress() {
    let connection = cloud_connection();
    downgrade_to_v8(&connection);
    insert_legacy_repertoire(&connection, "legacy-a", "Italian Game", "2026-01-01");
    insert_legacy_repertoire(
        &connection,
        "legacy-b",
        "Italian Game: Giuoco Piano",
        "2026-03-01",
    );
    insert_legacy_node(&connection, "node-a1", "legacy-a", None, "e2e4");
    insert_legacy_node(&connection, "node-a2", "legacy-a", Some("node-a1"), "e7e5");
    insert_legacy_node(&connection, "node-b1", "legacy-b", None, "e2e4");
    insert_legacy_progress(&connection, "node-a1", 9, "2026-01-05");
    insert_legacy_progress(&connection, "node-b1", 4, "2026-03-05");

    initialize_database(&connection).unwrap();

    let expected_id = repertoire_doc_id(&profile_key(), "w", "italian game");
    let (repertoires, id, name): (i64, String, String) = connection
        .query_row(
            "SELECT (SELECT COUNT(*) FROM repertoires), id, name FROM repertoires",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(repertoires, 1);
    assert_eq!(id, expected_id);
    assert_eq!(name, "Italian Game");

    // Node id phải derive lại đúng và chuỗi parent còn resolve.
    let root_id = repertoire_node_id(&expected_id, "pos-e2e4|e2e4");
    let child_id = repertoire_node_id(&expected_id, "pos-e7e5|e7e5");
    let resolved: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM repertoire_nodes child
             JOIN repertoire_nodes parent ON parent.id = child.parent_id
             WHERE child.id = ?1 AND parent.id = ?2",
            params![child_id, root_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(resolved, 1);

    // Tiến độ hai bản trùng gộp bằng MAX chứ không bỏ bên thua.
    let (correct, streak): (i64, i64) = connection
        .query_row(
            "SELECT correct_count, correct_streak FROM repertoire_progress WHERE node_id = ?1",
            params![root_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!((correct, streak), (9, 9));
}

#[test]
fn v9_backfills_node_updated_at_from_created_at() {
    let connection = cloud_connection();
    downgrade_to_v8(&connection);
    insert_legacy_repertoire(&connection, "legacy-a", "Italian Game", "2026-01-01");
    insert_legacy_node(&connection, "node-a1", "legacy-a", None, "e2e4");

    initialize_database(&connection).unwrap();

    assert_eq!(
        count(
            &connection,
            "SELECT COUNT(*) FROM repertoire_nodes WHERE updated_at = ''"
        ),
        0
    );
    let updated_at: String = connection
        .query_row("SELECT updated_at FROM repertoire_nodes", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(updated_at, "2026-01-01T00:00:00.000Z");
}

#[test]
fn v9_seeds_cloud_queue_for_all_three_entities() {
    let connection = cloud_connection();
    downgrade_to_v8(&connection);
    insert_legacy_repertoire(&connection, "legacy-a", "Italian Game", "2026-01-01");
    insert_legacy_node(&connection, "node-a1", "legacy-a", None, "e2e4");
    insert_legacy_progress(&connection, "node-a1", 2, "2026-01-05");

    initialize_database(&connection).unwrap();

    assert_eq!(queue_count(&connection, "repertoire", "upsert"), 1);
    assert_eq!(queue_count(&connection, "repertoire_node", "upsert"), 1);
    assert_eq!(queue_count(&connection, "repertoire_progress", "upsert"), 1);
}

#[test]
fn v9_drops_repertoires_without_profile() {
    let connection = cloud_connection();
    downgrade_to_v8(&connection);
    connection
        .execute(
            "INSERT INTO repertoires
               (id, profile_id, color, name, eco, source, created_at, updated_at)
             VALUES ('orphan', 404, 'w', 'Italian Game', NULL, 'history',
                     '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
    insert_legacy_node(&connection, "node-orphan", "orphan", None, "e2e4");

    initialize_database(&connection).unwrap();

    let counts: (i64, i64, i64) = connection
        .query_row(
            "SELECT (SELECT COUNT(*) FROM repertoires),
                    (SELECT COUNT(*) FROM repertoire_nodes),
                    (SELECT COUNT(*) FROM cloud_sync_queue)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(counts, (0, 0, 0));
}

#[test]
fn v9_is_noop_on_fresh_database_and_idempotent() {
    let connection = Connection::open_in_memory().unwrap();
    initialize_database(&connection).unwrap();
    initialize_database(&connection).expect("v9 phải chạy lặp an toàn");
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 9);
    assert_eq!(
        count(
            &connection,
            "SELECT COUNT(*) FROM cloud_sync_queue WHERE entity_type LIKE 'repertoire%'"
        ),
        0
    );
}

// --- Tombstone khi ghi ---

#[test]
fn rebuild_tombstones_dropped_nodes_and_upserts_survivors() {
    let mut connection = cloud_connection();
    let repertoire_id = save_family(
        &mut connection,
        "Italian Game",
        vec![
            seed_node("e4", None, "e2e4", true),
            seed_node("e5", Some("pos-e4|e2e4"), "e7e5", false),
        ],
    );
    let dropped = repertoire_node_id(&repertoire_id, "pos-e5|e7e5");
    let kept = repertoire_node_id(&repertoire_id, "pos-e4|e2e4");
    clear_queue(&connection);

    save_family(
        &mut connection,
        "Italian Game",
        vec![
            seed_node("e4", None, "e2e4", true),
            seed_node("c5", Some("pos-e4|e2e4"), "c7c5", false),
        ],
    );

    assert_eq!(
        queue_operation(&connection, "repertoire_node", &dropped),
        Some("delete".to_string())
    );
    let added = repertoire_node_id(&repertoire_id, "pos-c5|c7c5");
    assert_eq!(
        queue_operation(&connection, "repertoire_node", &added),
        Some("upsert".to_string())
    );
    // Node giữ nguyên payload thì không được enqueue lại.
    assert_eq!(queue_operation(&connection, "repertoire_node", &kept), None);
}

#[test]
fn rebuild_tombstones_progress_only_when_node_had_progress() {
    let mut connection = cloud_connection();
    let repertoire_id = save_family(
        &mut connection,
        "Italian Game",
        vec![
            seed_node("e4", None, "e2e4", true),
            seed_node("e5", Some("pos-e4|e2e4"), "e7e5", true),
            seed_node("d5", Some("pos-e4|e2e4"), "d7d5", true),
        ],
    );
    let with_progress = repertoire_node_id(&repertoire_id, "pos-e5|e7e5");
    let without_progress = repertoire_node_id(&repertoire_id, "pos-d5|d7d5");
    insert_legacy_progress(&connection, &with_progress, 3, "2026-04-01");
    clear_queue(&connection);

    save_family(
        &mut connection,
        "Italian Game",
        vec![seed_node("e4", None, "e2e4", true)],
    );

    assert_eq!(
        queue_operation(&connection, "repertoire_progress", &with_progress),
        Some("delete".to_string())
    );
    assert_eq!(
        queue_operation(&connection, "repertoire_progress", &without_progress),
        None
    );
}

#[test]
fn identical_rebuild_enqueues_no_node_upserts() {
    let mut connection = cloud_connection();
    let nodes = || {
        vec![
            seed_node("e4", None, "e2e4", true),
            seed_node("e5", Some("pos-e4|e2e4"), "e7e5", false),
        ]
    };
    save_family(&mut connection, "Italian Game", nodes());
    clear_queue(&connection);

    save_family(&mut connection, "Italian Game", nodes());

    // Trainer tự dựng cả hai màu mỗi lần mở, nên rebuild không đổi phải im lặng.
    assert_eq!(queue_count(&connection, "repertoire_node", "upsert"), 0);
    assert_eq!(queue_count(&connection, "repertoire_node", "delete"), 0);
}

#[test]
fn manual_variations_survive_a_rebuild() {
    let mut connection = cloud_connection();
    let repertoire_id = save_family(
        &mut connection,
        "Italian Game",
        vec![seed_node("e4", None, "e2e4", true)],
    );
    let manual_id = repertoire_node_id(&repertoire_id, "pos-manual|d2d4");
    connection
        .execute(
            "INSERT INTO repertoire_nodes
               (id, repertoire_id, parent_id, position_key, fen, move_san, move_uci,
                side_to_move, is_user_move, source, frequency, avg_cpl, comment,
                created_at, updated_at)
             VALUES (?1, ?2, NULL, 'pos-manual', 'fen', 'd4', 'd2d4', 'w', 1, 'manual',
                     0, NULL, NULL, '2026-01-01', '2026-01-01')",
            params![manual_id, repertoire_id],
        )
        .unwrap();
    clear_queue(&connection);

    save_family(
        &mut connection,
        "Italian Game",
        vec![seed_node("e4", None, "e2e4", true)],
    );

    // Biến thủ công không tái tạo được từ lịch sử ván; tombstone sẽ mất trên MỌI máy.
    let survived = count(
        &connection,
        &format!("SELECT COUNT(*) FROM repertoire_nodes WHERE id = '{manual_id}'"),
    );
    assert_eq!(survived, 1);
    assert_eq!(
        queue_operation(&connection, "repertoire_node", &manual_id),
        None
    );
}

#[test]
fn duplicate_merge_never_tombstones_the_repertoire_document() {
    let mut connection = cloud_connection();
    let canonical = save_family(
        &mut connection,
        "Italian Game",
        vec![seed_node("e4", None, "e2e4", true)],
    );
    insert_legacy_repertoire(
        &connection,
        "legacy-duplicate",
        "Italian Game: Giuoco Piano",
        "2026-05-01",
    );
    insert_legacy_node(&connection, "legacy-node", "legacy-duplicate", None, "e2e4");
    clear_queue(&connection);

    let rebuilt = save_family(
        &mut connection,
        "Italian Game: Giuoco Piano",
        vec![seed_node("e4", None, "e2e4", true)],
    );

    assert_eq!(rebuilt, canonical);
    // Bản thua dùng CHUNG doc id với survivor: tombstone sẽ xoá doc của survivor.
    assert_eq!(queue_count(&connection, "repertoire", "delete"), 0);
    assert_eq!(
        queue_operation(&connection, "repertoire", &canonical),
        Some("upsert".to_string())
    );
}

#[test]
fn pending_count_tracks_queue_and_reaches_zero_after_ack() {
    let mut connection = cloud_connection();
    assert_eq!(count_pending_cloud_changes_connection(&connection).unwrap(), 0);

    let repertoire_id = save_family(
        &mut connection,
        "Italian Game",
        vec![
            seed_node("e4", None, "e2e4", true),
            seed_node("e5", Some("pos-e4|e2e4"), "e7e5", false),
        ],
    );
    // 1 repertoire + 2 node.
    assert_eq!(count_pending_cloud_changes_connection(&connection).unwrap(), 3);

    let tokens = [
        ("repertoire", repertoire_id.clone()),
        (
            "repertoire_node",
            repertoire_node_id(&repertoire_id, "pos-e4|e2e4"),
        ),
        (
            "repertoire_node",
            repertoire_node_id(&repertoire_id, "pos-e5|e7e5"),
        ),
    ]
    .into_iter()
    .map(|(entity_type, entity_id)| CloudAckToken {
        entity_type: entity_type.to_string(),
        entity_id,
        generation: 1,
    })
    .collect();

    let remaining = acknowledge_cloud_changes_connection(&mut connection, tokens).unwrap();

    // Badge chỉ về 0 khi hàng đợi thật sự trống; đây là tín hiệu "an toàn đổi máy".
    assert_eq!(remaining, 0);
    assert_eq!(count_pending_cloud_changes_connection(&connection).unwrap(), 0);
}

#[test]
fn failed_save_leaves_cloud_queue_unchanged() {
    let mut connection = cloud_connection();
    save_family(
        &mut connection,
        "Italian Game",
        vec![seed_node("e4", None, "e2e4", true)],
    );
    clear_queue(&connection);

    // parent_key không tồn tại → build_save_plan lỗi trước khi mở transaction.
    let result = save_repertoire_connection(
        &mut connection,
        SaveRepertoireRequest {
            profile_id: 1,
            color: "w".to_string(),
            name: "Italian Game".to_string(),
            eco: None,
            nodes: vec![seed_node("e5", Some("pos-missing|x"), "e7e5", true)],
        },
    );

    assert!(result.is_err());
    assert_eq!(count(&connection, "SELECT COUNT(*) FROM cloud_sync_queue"), 0);
}
