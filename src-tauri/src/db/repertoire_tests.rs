use crate::*;

fn seed(key: &str, parent: Option<&str>, uci: &str, is_user: bool) -> RepertoireNodeSeed {
    RepertoireNodeSeed {
        node_key: key.to_string(),
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

fn setup() -> Connection {
    let connection = Connection::open_in_memory().unwrap();
    initialize_database(&connection, false).unwrap();
    connection
        .execute(
            "INSERT INTO player_profiles(id, platform, username, created_at)
                 VALUES (1, 'chesscom', 'learner', datetime('now'))",
            [],
        )
        .unwrap();
    connection
}

fn save_named(connection: &mut Connection, name: &str, nodes: Vec<RepertoireNodeSeed>) -> String {
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

fn save(connection: &mut Connection, nodes: Vec<RepertoireNodeSeed>) -> String {
    save_named(connection, "Test", nodes)
}

fn review(
    connection: &Connection,
    node_id: &str,
    correct: bool,
    duration_ms: u64,
) -> (u32, u32, String, i64) {
    // Bản sao logic review dùng trực tiếp connection cho test (không có tauri::State).
    connection
            .execute(
                "INSERT OR IGNORE INTO repertoire_progress (node_id, profile_id, due_at, updated_at)
                 VALUES (?1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
                params![node_id],
            )
            .unwrap();
    let current: (u32, u32) = connection
        .query_row(
            "SELECT interval_days, correct_streak FROM repertoire_progress WHERE node_id = ?1",
            params![node_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    let cpl = if correct { 5.0 } else { 1_000.0 };
    let schedule = schedule_review(current.0, current.1, cpl, 0, 0, duration_ms, false);
    let status = if !schedule.correct || schedule.result == "revealed" {
        "learning"
    } else if schedule.next_streak >= 3 {
        "mastered"
    } else {
        "review"
    };
    connection
        .execute(
            "UPDATE repertoire_progress SET
                   correct_count = correct_count + CASE WHEN ?2 = 1 THEN 1 ELSE 0 END,
                   wrong_count = wrong_count + CASE WHEN ?2 = 0 THEN 1 ELSE 0 END,
                   correct_streak = ?3, status = ?4, interval_days = ?5,
                   due_at = strftime('%Y-%m-%dT%H:%M:%fZ','now', ?6),
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE node_id = ?1",
            params![
                node_id,
                schedule.correct,
                schedule.next_streak,
                status,
                schedule.interval_days,
                format!("+{} seconds", schedule.delay_seconds),
            ],
        )
        .unwrap();
    connection
        .query_row(
            "SELECT correct_count, wrong_count, status, interval_days
                 FROM repertoire_progress WHERE node_id = ?1",
            params![node_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap()
}

#[test]
fn saves_tree_resolves_parents_and_dedups() {
    let mut connection = setup();
    let nodes = vec![
        seed("e4", None, "e2e4", true),
        seed("e4:e5", Some("e4"), "e7e5", false),
        seed("e4:e5:Nf3", Some("e4:e5"), "g1f3", true),
    ];
    let repertoire_id = save(&mut connection, nodes);
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM repertoire_nodes WHERE repertoire_id = ?1",
            params![repertoire_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 3);
    // parent của Nf3 phải trỏ đúng tới node e5
    let has_parent: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM repertoire_nodes child
                 JOIN repertoire_nodes parent ON parent.id = child.parent_id
                 WHERE child.move_uci = 'g1f3' AND parent.move_uci = 'e7e5'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(has_parent, 1);
}

#[test]
fn allows_two_valid_user_moves_at_same_position() {
    let mut connection = setup();
    // Cùng position_key (pos-root) nhưng khác move → hai node anh em hợp lệ.
    let mut a = seed("root:Nf3", None, "g1f3", true);
    a.position_key = "pos-root".to_string();
    let mut b = seed("root:e4", None, "e2e4", true);
    b.position_key = "pos-root".to_string();
    let repertoire_id = save(&mut connection, vec![a, b]);
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM repertoire_nodes
                 WHERE repertoire_id = ?1 AND position_key = 'pos-root' AND is_user_move = 1",
            params![repertoire_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 2);
}

#[test]
fn rejects_unknown_profile() {
    let mut connection = setup();
    let result = save_repertoire_connection(
        &mut connection,
        SaveRepertoireRequest {
            profile_id: 999,
            color: "w".to_string(),
            name: "X".to_string(),
            eco: None,
            nodes: vec![seed("e4", None, "e2e4", true)],
        },
    );
    assert!(result.is_err());
}

#[test]
fn review_maps_correct_to_long_interval_and_wrong_to_relearn() {
    let mut connection = setup();
    let repertoire_id = save(&mut connection, vec![seed("e4", None, "e2e4", true)]);
    let node_id: String = connection
        .query_row(
            "SELECT id FROM repertoire_nodes
                 WHERE repertoire_id = ?1 AND move_uci = 'e2e4' LIMIT 1",
            params![repertoire_id],
            |row| row.get(0),
        )
        .unwrap();
    let correct = review(&connection, &node_id, true, 1_000);
    assert_eq!(correct.0, 1); // correct_count
    assert_eq!(correct.3, 7); // interval_days = 7 (clean, lần đầu)
    let wrong = review(&connection, &node_id, false, 1_000);
    assert_eq!(wrong.1, 1); // wrong_count
    assert_eq!(wrong.2, "learning");
    assert_eq!(wrong.3, 0); // interval reset
}

#[test]
fn rebuild_upserts_family_preserves_progress_and_other_families() {
    let mut connection = setup();
    let original = save(
        &mut connection,
        vec![
            seed("e4", None, "e2e4", true),
            seed("e4:e5", Some("e4"), "e7e5", false),
        ],
    );
    let node_id: String = connection
        .query_row(
            "SELECT id FROM repertoire_nodes
                 WHERE repertoire_id = ?1 AND move_uci = 'e2e4' LIMIT 1",
            params![original],
            |row| row.get(0),
        )
        .unwrap();
    review(&connection, &node_id, true, 1_000);
    let other = save_named(
        &mut connection,
        "Sicilian Defense",
        vec![seed("c5", None, "c7c5", true)],
    );

    let rebuilt = save(
        &mut connection,
        vec![
            seed("e4", None, "e2e4", true),
            seed("e4:c5", Some("e4"), "c7c5", false),
        ],
    );
    assert_eq!(rebuilt, original);
    let counts: (i64, i64, i64, i64) = connection
        .query_row(
            "SELECT
                   (SELECT COUNT(*) FROM repertoires WHERE profile_id = 1 AND color = 'w'),
                   (SELECT COUNT(*) FROM repertoire_nodes WHERE repertoire_id = ?1),
                   (SELECT COUNT(*) FROM repertoire_progress WHERE node_id = ?2),
                   (SELECT COUNT(*) FROM repertoire_nodes WHERE repertoire_id = ?3)",
            params![rebuilt, node_id, other],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();
    assert_eq!(counts, (2, 2, 1, 1));
}

#[test]
fn rebuild_deduplicates_variations_by_base_family_and_keeps_colors_separate() {
    let mut connection = setup();
    let canonical = save_named(
        &mut connection,
        "Italian Game",
        vec![seed("e4", None, "e2e4", true)],
    );
    connection
        .execute(
            "INSERT INTO repertoires
                   (id, profile_id, color, name, eco, source, created_at, updated_at)
                 VALUES
                   ('white-anti-fried', 1, 'w',
                    'Italian Game: Anti-Fried Liver Defense', 'C50', 'history',
                    datetime('now'), datetime('now')),
                   ('white-classical', 1, 'w',
                    'Italian Game: Classical Variation, Greco Gambit, Traditional Line',
                    'C54', 'history', datetime('now'), datetime('now')),
                   ('black-classical', 1, 'b',
                    'Italian Game: Classical Variation', 'C54', 'history',
                    datetime('now'), datetime('now'))",
            [],
        )
        .unwrap();
    let rebuilt = save_named(
        &mut connection,
        "Italian Game: Classical Variation",
        vec![seed("e4", None, "e2e4", true)],
    );
    assert_eq!(rebuilt, canonical);
    let counts: (i64, i64) = connection
        .query_row(
            "SELECT
               (SELECT COUNT(*) FROM repertoires
                WHERE profile_id = 1 AND color = 'w'
                  AND lower(name) LIKE 'italian game%'),
               (SELECT COUNT(*) FROM repertoires
                WHERE profile_id = 1 AND color = 'b'
                  AND lower(name) LIKE 'italian game%')",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(counts, (1, 1));
    let canonical_name: String = connection
        .query_row(
            "SELECT name FROM repertoires WHERE id = ?1",
            params![canonical],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(canonical_name, "Italian Game");
}
