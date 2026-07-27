use super::repertoire_cloud_fixtures::*;
use crate::*;

fn base_request() -> MergeCloudChangesRequest {
    MergeCloudChangesRequest::default()
}

// --- Export ---

#[test]
fn export_returns_derived_ids_profile_key_and_parent_node_key() {
    let mut connection = cloud_connection();
    let repertoire_id = save_family(
        &mut connection,
        "Italian Game",
        vec![
            seed_node("e4", None, "e2e4", true),
            seed_node("e5", Some("pos-e4|e2e4"), "e7e5", false),
        ],
    );

    let repertoires = export_repertoires(&connection).unwrap();
    assert_eq!(repertoires.len(), 1);
    let data = repertoires[0].data.as_ref().unwrap();
    assert_eq!(repertoires[0].document_id, repertoire_id);
    assert_eq!(data.profile_key, "chesscom:learner");
    assert_eq!(data.name, "Italian Game");

    let nodes = export_repertoire_nodes(&connection).unwrap();
    let child = nodes
        .iter()
        .find(|change| change.data.as_ref().unwrap().move_uci == "e7e5")
        .unwrap();
    let child_data = child.data.as_ref().unwrap();
    assert_eq!(child_data.repertoire_cloud_id, repertoire_id);
    assert_eq!(child_data.node_key, "pos-e5|e7e5");
    // parent_node_key là KHÓA, không phải id local — merge derive lại được.
    assert_eq!(child_data.parent_node_key.as_deref(), Some("pos-e4|e2e4"));
}

#[test]
fn export_demotes_missing_entity_to_tombstone_instead_of_failing() {
    let connection = cloud_connection();
    // Queue row trỏ tới repertoire không tồn tại: đường cũ sẽ trả Err và khoá sync.
    let missing = "a".repeat(64);
    queue_cloud_change(&connection, "repertoire", &missing, "upsert").unwrap();

    let exported = export_repertoires(&connection).unwrap();

    assert_eq!(exported.len(), 1);
    assert!(exported[0].deleted);
    assert!(exported[0].data.is_none());
    assert_eq!(
        queue_operation(&connection, "repertoire", &missing),
        Some("delete".to_string())
    );
}

#[test]
fn deleting_profile_tombstones_the_whole_repertoire_tree() {
    let mut connection = cloud_connection();
    let repertoire_id = save_family(
        &mut connection,
        "Italian Game",
        vec![seed_node("e4", None, "e2e4", true)],
    );
    let node_id = repertoire_node_id(&repertoire_id, "pos-e4|e2e4");
    insert_legacy_progress(&connection, &node_id, 2, "2026-06-01");
    clear_queue(&connection);

    let transaction = connection.transaction().unwrap();
    remove_repertoires_for_profile(&transaction, 1, true).unwrap();
    transaction.commit().unwrap();

    for (entity, id) in [
        ("repertoire", repertoire_id.as_str()),
        ("repertoire_node", node_id.as_str()),
        ("repertoire_progress", node_id.as_str()),
    ] {
        assert_eq!(
            queue_operation(&connection, entity, id),
            Some("delete".to_string()),
            "thiếu tombstone cho {entity}"
        );
    }
    assert_eq!(count(&connection, "SELECT COUNT(*) FROM repertoires"), 0);
}

// --- Merge ---

#[test]
fn round_trip_export_then_merge_reproduces_identical_rows() {
    let mut source = cloud_connection();
    let repertoire_id = save_family(
        &mut source,
        "Italian Game",
        vec![
            seed_node("e4", None, "e2e4", true),
            seed_node("e5", Some("pos-e4|e2e4"), "e7e5", false),
        ],
    );
    let exported_repertoires = export_repertoires(&source).unwrap();
    let exported_nodes = export_repertoire_nodes(&source).unwrap();

    let mut target = cloud_connection();
    merge_cloud_changes_connection(
        &mut target,
        MergeCloudChangesRequest {
            repertoires: exported_repertoires
                .into_iter()
                .map(|change| CloudRemoteRepertoireChange {
                    document_id: change.document_id,
                    deleted: change.deleted,
                    data: change.data,
                })
                .collect(),
            repertoire_nodes: exported_nodes
                .into_iter()
                .map(|change| CloudRemoteRepertoireNodeChange {
                    document_id: change.document_id,
                    deleted: change.deleted,
                    data: change.data,
                })
                .collect(),
            ..base_request()
        },
    )
    .unwrap();

    let (repertoires, nodes): (i64, i64) = target
        .query_row(
            "SELECT (SELECT COUNT(*) FROM repertoires WHERE id = ?1),
                    (SELECT COUNT(*) FROM repertoire_nodes WHERE repertoire_id = ?1)",
            params![repertoire_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!((repertoires, nodes), (1, 2));
    let resolved = count(
        &target,
        "SELECT COUNT(*) FROM repertoire_nodes child
         JOIN repertoire_nodes parent ON parent.id = child.parent_id
         WHERE child.move_uci = 'e7e5' AND parent.move_uci = 'e2e4'",
    );
    assert_eq!(resolved, 1);
}

#[test]
fn node_arriving_before_its_parent_still_resolves_parent_id() {
    let mut connection = cloud_connection();
    let repertoire = remote_repertoire("Italian Game", "2026-05-01T00:00:00.000Z");
    let repertoire_id = repertoire.cloud_id.clone();
    let child = remote_node(
        &repertoire_id,
        "e7e5",
        Some("e2e4"),
        "2026-05-01T00:00:00.000Z",
    );
    let parent = remote_node(&repertoire_id, "e2e4", None, "2026-05-01T00:00:00.000Z");

    // Con trước cha trong cùng batch: không cần inbox vì parent_id được derive.
    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoires: vec![repertoire_upsert(repertoire)],
            repertoire_nodes: vec![node_upsert(child), node_upsert(parent)],
            ..base_request()
        },
    )
    .unwrap();

    let resolved = count(
        &connection,
        "SELECT COUNT(*) FROM repertoire_nodes child
         JOIN repertoire_nodes parent ON parent.id = child.parent_id
         WHERE child.move_uci = 'e7e5' AND parent.move_uci = 'e2e4'",
    );
    assert_eq!(resolved, 1);
}

#[test]
fn node_before_repertoire_waits_in_inbox_then_drains() {
    let mut connection = cloud_connection();
    let repertoire = remote_repertoire("Italian Game", "2026-05-01T00:00:00.000Z");
    let node = remote_node(&repertoire.cloud_id, "e2e4", None, "2026-05-01T00:00:00.000Z");

    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoire_nodes: vec![node_upsert(node)],
            ..base_request()
        },
    )
    .unwrap();
    assert_eq!(
        count(&connection, "SELECT COUNT(*) FROM repertoire_node_inbox"),
        1
    );
    assert_eq!(count(&connection, "SELECT COUNT(*) FROM repertoire_nodes"), 0);

    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoires: vec![repertoire_upsert(repertoire)],
            ..base_request()
        },
    )
    .unwrap();
    assert_eq!(
        count(&connection, "SELECT COUNT(*) FROM repertoire_node_inbox"),
        0
    );
    assert_eq!(count(&connection, "SELECT COUNT(*) FROM repertoire_nodes"), 1);
}

#[test]
fn progress_before_node_waits_in_inbox_and_drains_without_enqueueing() {
    let mut connection = cloud_connection();
    let repertoire = remote_repertoire("Italian Game", "2026-05-01T00:00:00.000Z");
    let repertoire_id = repertoire.cloud_id.clone();
    let node = remote_node(&repertoire_id, "e2e4", None, "2026-05-01T00:00:00.000Z");
    let node_id = node.cloud_id.clone();
    let progress = remote_progress(&repertoire_id, &node_id, 5, "2026-05-02T00:00:00.000Z");

    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoire_progress: vec![progress_upsert(progress)],
            ..base_request()
        },
    )
    .unwrap();
    assert_eq!(
        count(&connection, "SELECT COUNT(*) FROM repertoire_progress_inbox"),
        1
    );

    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoires: vec![repertoire_upsert(repertoire)],
            repertoire_nodes: vec![node_upsert(node)],
            ..base_request()
        },
    )
    .unwrap();

    let (waiting, applied, correct): (i64, i64, i64) = connection
        .query_row(
            "SELECT (SELECT COUNT(*) FROM repertoire_progress_inbox),
                    (SELECT COUNT(*) FROM repertoire_progress),
                    (SELECT correct_count FROM repertoire_progress WHERE node_id = ?1)",
            params![node_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!((waiting, applied, correct), (0, 1, 5));
    // Drain không được enqueue: dữ liệu tới từ cloud, enqueue lại là echo loop.
    assert_eq!(
        count(
            &connection,
            "SELECT COUNT(*) FROM cloud_sync_queue WHERE entity_type LIKE 'repertoire%'"
        ),
        0
    );
}

#[test]
fn pending_local_delete_beats_remote_upsert() {
    let mut connection = cloud_connection();
    let repertoire = remote_repertoire("Italian Game", "2026-05-01T00:00:00.000Z");
    let node = remote_node(&repertoire.cloud_id, "e2e4", None, "2026-05-01T00:00:00.000Z");
    let node_id = node.cloud_id.clone();
    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoires: vec![repertoire_upsert(repertoire)],
            ..base_request()
        },
    )
    .unwrap();
    queue_cloud_change(&connection, "repertoire_node", &node_id, "delete").unwrap();

    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoire_nodes: vec![node_upsert(node)],
            ..base_request()
        },
    )
    .unwrap();

    assert_eq!(
        count(&connection, "SELECT COUNT(*) FROM repertoire_nodes"),
        0,
        "node đã tombstone không được hồi sinh"
    );
}

#[test]
fn remote_node_tombstone_clears_node_progress_queue_and_inbox() {
    let mut connection = cloud_connection();
    let repertoire = remote_repertoire("Italian Game", "2026-05-01T00:00:00.000Z");
    let repertoire_id = repertoire.cloud_id.clone();
    let node = remote_node(&repertoire_id, "e2e4", None, "2026-05-01T00:00:00.000Z");
    let node_id = node.cloud_id.clone();
    let progress = remote_progress(&repertoire_id, &node_id, 3, "2026-05-02T00:00:00.000Z");
    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoires: vec![repertoire_upsert(repertoire)],
            repertoire_nodes: vec![node_upsert(node)],
            repertoire_progress: vec![progress_upsert(progress)],
            ..base_request()
        },
    )
    .unwrap();

    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoire_nodes: vec![CloudRemoteRepertoireNodeChange {
                document_id: node_id.clone(),
                deleted: true,
                data: None,
            }],
            ..base_request()
        },
    )
    .unwrap();

    let counts: (i64, i64, i64) = connection
        .query_row(
            "SELECT (SELECT COUNT(*) FROM repertoire_nodes),
                    (SELECT COUNT(*) FROM repertoire_progress),
                    (SELECT COUNT(*) FROM cloud_sync_queue
                       WHERE entity_id = ?1 AND entity_type LIKE 'repertoire%')",
            params![node_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(counts, (0, 0, 0));
}

#[test]
fn invalid_documents_are_skipped_without_aborting_the_batch() {
    let mut connection = cloud_connection();
    let repertoire = remote_repertoire("Italian Game", "2026-05-01T00:00:00.000Z");
    let repertoire_id = repertoire.cloud_id.clone();
    let good = remote_node(&repertoire_id, "e2e4", None, "2026-05-01T00:00:00.000Z");

    // node_key không khớp position_key|move_uci
    let mut broken_key = remote_node(&repertoire_id, "d2d4", None, "2026-05-01T00:00:00.000Z");
    broken_key.node_key = "khong-khop".to_string();
    // doc id không derive lại được từ payload
    let mut wrong_id = remote_node(&repertoire_id, "c2c4", None, "2026-05-01T00:00:00.000Z");
    wrong_id.cloud_id = "f".repeat(64);
    // family lệch khỏi doc id
    let mut wrong_family = remote_repertoire("Sicilian Defense", "2026-05-01T00:00:00.000Z");
    wrong_family.name = "Italian Game".to_string();
    // interval_days ngoài khoảng cho phép
    let mut bad_interval =
        remote_progress(&repertoire_id, &good.cloud_id, 1, "2026-05-02T00:00:00.000Z");
    bad_interval.interval_days = 999;

    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoires: vec![
                repertoire_upsert(repertoire),
                CloudRemoteRepertoireChange {
                    document_id: wrong_family.cloud_id.clone(),
                    deleted: false,
                    data: Some(wrong_family),
                },
            ],
            repertoire_nodes: vec![
                CloudRemoteRepertoireNodeChange {
                    document_id: broken_key.cloud_id.clone(),
                    deleted: false,
                    data: Some(broken_key),
                },
                CloudRemoteRepertoireNodeChange {
                    document_id: wrong_id.cloud_id.clone(),
                    deleted: false,
                    data: Some(wrong_id),
                },
                node_upsert(good),
            ],
            repertoire_progress: vec![progress_upsert(bad_interval)],
            ..base_request()
        },
    )
    .expect("một doc lỗi không được làm nghẽn cả batch");

    let counts: (i64, i64, i64) = connection
        .query_row(
            "SELECT (SELECT COUNT(*) FROM repertoires),
                    (SELECT COUNT(*) FROM repertoire_nodes),
                    (SELECT COUNT(*) FROM repertoire_progress)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(counts, (1, 1, 0));
}

#[test]
fn older_remote_updated_at_does_not_overwrite_newer_local_data() {
    let mut connection = cloud_connection();
    let repertoire = remote_repertoire("Italian Game", "2026-05-10T00:00:00.000Z");
    let repertoire_id = repertoire.cloud_id.clone();
    let fresh = remote_node(&repertoire_id, "e2e4", None, "2026-05-10T00:00:00.000Z");
    let node_id = fresh.cloud_id.clone();
    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoires: vec![repertoire_upsert(repertoire)],
            repertoire_nodes: vec![node_upsert(fresh)],
            ..base_request()
        },
    )
    .unwrap();

    let mut stale = remote_node(&repertoire_id, "e2e4", None, "2026-01-01T00:00:00.000Z");
    stale.frequency = 999;
    merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoire_nodes: vec![node_upsert(stale)],
            ..base_request()
        },
    )
    .unwrap();

    let frequency: i64 = connection
        .query_row(
            "SELECT frequency FROM repertoire_nodes WHERE id = ?1",
            params![node_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(frequency, 7);
}

#[test]
fn oversized_remote_batch_is_rejected() {
    let mut connection = cloud_connection();
    let nodes = (0..200_001)
        .map(|index| CloudRemoteRepertoireNodeChange {
            document_id: format!("{index:064}"),
            deleted: true,
            data: None,
        })
        .collect();
    let result = merge_cloud_changes_connection(
        &mut connection,
        MergeCloudChangesRequest {
            repertoire_nodes: nodes,
            ..base_request()
        },
    );
    assert!(result.is_err());
}
