use crate::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn cloud_test_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(
                "CREATE TABLE saved_games (
                    id TEXT PRIMARY KEY,
                    pgn TEXT NOT NULL,
                    white TEXT NOT NULL,
                    black TEXT NOT NULL,
                    white_elo TEXT,
                    black_elo TEXT,
                    result TEXT,
                    event TEXT,
                    game_date TEXT,
                    played_at TEXT,
                    eco TEXT,
                    opening TEXT,
                    time_control TEXT,
                    time_class TEXT,
                    source_url TEXT,
                    source_platform TEXT,
                    analysis_complete INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL
                );
                CREATE TABLE player_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    username TEXT NOT NULL,
                    last_sync_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX idx_test_profiles_identity
                ON player_profiles(platform, username COLLATE NOCASE);
                CREATE TABLE game_profiles (
                    game_id TEXT NOT NULL,
                    profile_id INTEGER NOT NULL,
                    player_color TEXT NOT NULL,
                    linked_at TEXT NOT NULL,
                    PRIMARY KEY(game_id, profile_id)
                );
                CREATE TABLE engine_analyses (
                    game_id TEXT NOT NULL
                );
                CREATE TABLE cloud_sync_queue (
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    generation INTEGER NOT NULL DEFAULT 1,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_retry_at TEXT,
                    last_error TEXT,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(entity_type, entity_id)
                );",
            )
            .expect("create cloud test schema");
        connection
    }

    fn cloud_game(pgn: &str) -> CloudSavedGame {
        let normalized_pgn = pgn.trim().replace("\r\n", "\n");
        let mut hasher = Sha256::new();
        hasher.update(normalized_pgn.as_bytes());
        CloudSavedGame {
            id: format!("{:x}", hasher.finalize()),
            pgn: normalized_pgn,
            white: "White".to_string(),
            black: "Black".to_string(),
            white_elo: None,
            black_elo: None,
            result: Some("1-0".to_string()),
            event: Some("Test".to_string()),
            date: None,
            played_at: None,
            eco: None,
            opening: None,
            time_control: None,
            time_class: None,
            source_url: None,
            source_platform: None,
            created_at: "2026-07-23 10:00:00".to_string(),
            last_opened_at: "2026-07-23 10:00:00".to_string(),
            profile_keys: Vec::new(),
        }
    }

    #[test]
    fn account_databases_are_isolated_and_legacy_is_claimed_once() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let data_dir = std::env::temp_dir().join(format!(
            "chess-coach-account-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&data_dir).unwrap();
        let guest = Connection::open(data_dir.join("ky-pho.sqlite3")).unwrap();
        initialize_database(&guest, true).unwrap();
        let guest_profiles: i64 = guest
            .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
            .unwrap();
        assert!(guest_profiles > 0);
        let mut active = ActiveDatabase {
            connection: guest,
            data_dir: data_dir.clone(),
            active_uid: None,
            generation: 0,
        };

        let first = activate_cloud_account_connection(&mut active, "firebase-user-a").unwrap();
        assert!(first.changed);
        assert!(first.claimed_legacy_data);
        let account_a_profiles: i64 = active
            .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(account_a_profiles, guest_profiles);

        let second = activate_cloud_account_connection(&mut active, "firebase-user-b").unwrap();
        assert!(second.changed);
        assert!(!second.claimed_legacy_data);
        let account_b_profiles: i64 = active
            .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(account_b_profiles, 0);

        let reopened = activate_cloud_account_connection(&mut active, "firebase-user-a").unwrap();
        assert!(reopened.changed);
        assert!(!reopened.claimed_legacy_data);
        let reopened_profiles: i64 = active
            .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(reopened_profiles, guest_profiles);

        drop(active);
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn ambiguous_legacy_account_history_is_not_migrated_automatically() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let data_dir = std::env::temp_dir().join(format!(
            "chess-coach-account-ambiguity-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&data_dir).unwrap();
        let guest = Connection::open(data_dir.join("ky-pho.sqlite3")).unwrap();
        initialize_database(&guest, true).unwrap();
        for uid in ["firebase-user-a", "firebase-user-b"] {
            guest
                .execute(
                    "INSERT INTO cloud_sync_cursors
                     (uid, collection_name, initialized)
                     VALUES (?1, 'games', 1)",
                    params![uid],
                )
                .unwrap();
        }
        let mut active = ActiveDatabase {
            connection: guest,
            data_dir: data_dir.clone(),
            active_uid: None,
            generation: 0,
        };

        let error = activate_cloud_account_connection(&mut active, "firebase-user-a")
            .err()
            .expect("ambiguous history must be rejected");
        assert!(error.contains("nhiều tài khoản Firebase"));

        drop(active);
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn cloud_queue_keeps_new_generation_for_retries() {
        let mut connection = cloud_test_connection();
        queue_cloud_change(&connection, "game", "game-1", "upsert").unwrap();
        connection
            .execute(
                "UPDATE cloud_sync_queue
                 SET attempts = 3, last_error = 'offline'
                 WHERE entity_type = 'game' AND entity_id = 'game-1'",
                [],
            )
            .unwrap();
        queue_cloud_change(&connection, "game", "game-1", "delete").unwrap();
        let remaining = acknowledge_cloud_changes_connection(
            &mut connection,
            vec![CloudAckToken {
                entity_type: "game".to_string(),
                entity_id: "game-1".to_string(),
                generation: 1,
            }],
        )
        .unwrap();

        let state: (String, i64, i64, Option<String>) = connection
            .query_row(
                "SELECT operation, generation, attempts, last_error
                 FROM cloud_sync_queue
                 WHERE entity_type = 'game' AND entity_id = 'game-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(remaining, 1);
        assert_eq!(state, ("delete".to_string(), 2, 0, None));
    }

    #[test]
    fn failed_cloud_change_persists_retry_state() {
        let connection = cloud_test_connection();
        queue_cloud_change(&connection, "profile", "lichess_player", "upsert").unwrap();
        mark_cloud_changes_failed_connection(
            &connection,
            vec![CloudAckToken {
                entity_type: "profile".to_string(),
                entity_id: "lichess_player".to_string(),
                generation: 1,
            }],
            "offline".to_string(),
        )
        .unwrap();

        let state: (i64, Option<String>, Option<String>) = connection
            .query_row(
                "SELECT attempts, next_retry_at, last_error
                 FROM cloud_sync_queue
                 WHERE entity_type = 'profile' AND entity_id = 'lichess_player'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(state.0, 1);
        assert!(state.1.is_some());
        assert_eq!(state.2.as_deref(), Some("offline"));
    }

    #[test]
    fn remote_tombstone_removes_local_game_and_pending_upload() {
        let mut connection = cloud_test_connection();
        let game = cloud_game("[Event \"Test\"]\n\n1. e4 e5 1-0");
        connection
            .execute(
                "INSERT INTO saved_games
                 (id, pgn, white, black, created_at, last_opened_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &game.id,
                    &game.pgn,
                    &game.white,
                    &game.black,
                    &game.created_at,
                    &game.last_opened_at
                ],
            )
            .unwrap();
        queue_cloud_change(&connection, "game", &game.id, "upsert").unwrap();

        let result = merge_cloud_changes_connection(
            &mut connection,
            MergeCloudChangesRequest {
                profiles: Vec::new(),
                games: vec![CloudRemoteGameChange {
                    document_id: game.id.clone(),
                    deleted: true,
                    needs_upgrade: false,
                    data: None,
                }],
            },
        )
        .unwrap();

        assert_eq!(result.games_deleted, 1);
        let saved: i64 = connection
            .query_row("SELECT COUNT(*) FROM saved_games", [], |row| row.get(0))
            .unwrap();
        let pending: i64 = connection
            .query_row("SELECT COUNT(*) FROM cloud_sync_queue", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(saved, 0);
        assert_eq!(pending, 0);
    }

    #[test]
    fn local_delete_wins_over_remote_upsert() {
        let mut connection = cloud_test_connection();
        let game = cloud_game("[Event \"Test\"]\n\n1. d4 d5 1-0");
        queue_cloud_change(&connection, "game", &game.id, "delete").unwrap();

        merge_cloud_changes_connection(
            &mut connection,
            MergeCloudChangesRequest {
                profiles: Vec::new(),
                games: vec![CloudRemoteGameChange {
                    document_id: game.id.clone(),
                    deleted: false,
                    needs_upgrade: false,
                    data: Some(game),
                }],
            },
        )
        .unwrap();

        let saved: i64 = connection
            .query_row("SELECT COUNT(*) FROM saved_games", [], |row| row.get(0))
            .unwrap();
        let operation: String = connection
            .query_row(
                "SELECT operation FROM cloud_sync_queue WHERE entity_type = 'game'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(saved, 0);
        assert_eq!(operation, "delete");
    }

    #[test]
    fn splits_lichess_multi_pgn_without_losing_event_headers() {
        let games = split_multi_pgn(
            "[Event \"Game 1\"]\n[Result \"1-0\"]\n\n1. e4 e5 1-0\n\n[Event \"Game 2\"]\n[Result \"0-1\"]\n\n1. d4 d5 0-1",
        );
        assert_eq!(games.len(), 2);
        assert!(games[0].starts_with("[Event \"Game 1\"]"));
        assert!(games[1].starts_with("[Event \"Game 2\"]"));
    }

    #[test]
    fn validates_public_chess_usernames_and_filters() {
        assert!(valid_username("Cuongkool"));
        assert!(valid_username("player-name_2"));
        assert!(!valid_username("player/name"));
        assert_eq!(normalized_time_class(Some("rapid")), Some("rapid"));
        assert_eq!(normalized_time_class(Some("unknown")), None);
    }

    #[test]
    fn extracts_played_timestamp_from_pgn_headers() {
        let pgn =
            "[Event \"Live Chess\"]\n[UTCDate \"2026.07.22\"]\n[UTCTime \"09:08:07\"]\n\n1. e4 e5";
        assert_eq!(
            played_at_from_pgn(pgn),
            Some("2026-07-22 09:08:07".to_string())
        );
        assert_eq!(
            played_at_from_pgn("[Date \"2026.07.21\"]\n\n1. d4 d5"),
            Some("2026-07-21".to_string())
        );
    }

    fn coach_request() -> ExplainMoveRequest {
        ExplainMoveRequest {
            player_elo: Some("1200".to_string()),
            side_just_moved: "Trắng".to_string(),
            side_to_move: "Đen".to_string(),
            phase: "Khai cuộc".to_string(),
            move_number: 6,
            played_move: "Bd7".to_string(),
            fen_before: "before".to_string(),
            fen_after: "after".to_string(),
            evaluation: "+1.34".to_string(),
            centipawn_loss: 54,
            best_move: "e6".to_string(),
            best_line: vec!["e6".to_string(), "h3".to_string()],
            best_reply: Some("h3".to_string()),
            reply_line: vec!["h3".to_string()],
        }
    }

    #[test]
    fn normalizes_standalone_markdown_labels_and_internal_fields() {
        let normalized = normalize_coach_explanation(
            "**SO SÁNH**\nNước này trùng khớp hoàn toàn với nuoc_tot_nhat.",
            &coach_request(),
        );

        assert_eq!(normalized.lines().count(), 4);
        assert!(normalized.contains("SO SÁNH: Nước này trùng khớp hoàn toàn với nước tốt nhất e6."));
        assert!(!normalized.contains("nuoc_tot_nhat"));
        assert!(!normalized.contains("**"));
    }

    #[test]
    fn keeps_each_section_on_one_canonical_line() {
        let normalized = normalize_coach_explanation(
            "**ĐÁNH GIÁ**\nBd7 mất 54 centipawn.\n**Ý TƯỞNG**\nTượng phát triển.\n**SO SÁNH**\ne6 linh hoạt hơn.\n**KẾ HOẠCH**\nben_toi_luot nên chơi nuoc_dap_tot_nhat.",
            &coach_request(),
        );
        let lines = normalized.lines().collect::<Vec<_>>();

        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0], "ĐÁNH GIÁ: Bd7 mất 54 centipawn.");
        assert_eq!(lines[1], "Ý TƯỞNG: Tượng phát triển.");
        assert_eq!(lines[2], "SO SÁNH: e6 linh hoạt hơn.");
        assert_eq!(
            lines[3],
            "KẾ HOẠCH: bên Đen tới lượt nên chơi nước đáp tốt nhất h3."
        );
    }
}
