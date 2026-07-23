use crate::*;

fn legacy_connection() -> Connection {
    let connection = Connection::open_in_memory().expect("open legacy database");
    create_legacy_schema(&connection);
    connection
}

fn create_legacy_schema(connection: &Connection) {
    connection
        .execute_batch(
            "CREATE TABLE saved_games (
                id TEXT PRIMARY KEY, pgn TEXT NOT NULL, white TEXT NOT NULL, black TEXT NOT NULL,
                white_elo TEXT, black_elo TEXT, result TEXT, event TEXT, game_date TEXT,
                eco TEXT, time_control TEXT, source_url TEXT,
                created_at TEXT NOT NULL, last_opened_at TEXT NOT NULL
             );
             CREATE TABLE ai_explanations (
                cache_key TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
                prompt_version TEXT NOT NULL, explanation TEXT NOT NULL, created_at TEXT NOT NULL
             );
             CREATE TABLE engine_analyses (
                game_id TEXT NOT NULL, ply INTEGER NOT NULL, engine_version TEXT NOT NULL,
                depth INTEGER NOT NULL, result_json TEXT NOT NULL, color TEXT NOT NULL,
                phase TEXT NOT NULL, quality TEXT NOT NULL, centipawn_loss REAL NOT NULL,
                think_time_seconds REAL, is_quick INTEGER NOT NULL DEFAULT 0,
                is_time_pressure INTEGER NOT NULL DEFAULT 0,
                tags_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL,
                PRIMARY KEY(game_id, ply, engine_version)
             );
             INSERT INTO saved_games
             (id, pgn, white, black, result, source_url, created_at, last_opened_at)
             VALUES ('game-1', '[Date \"2026.07.23\"]\n\n1. e4 e5', 'White', 'Black', '1-0',
                     'https://lichess.org/test', '2026-07-23', '2026-07-23');
             INSERT INTO ai_explanations
             VALUES ('cache-1', 'openai', 'model', 'prompt-v1', 'Giải thích cũ', '2026-07-23');
             INSERT INTO engine_analyses
             VALUES ('game-1', 1, 'stockfish-18-lite', 11, '{\"depth\":11}', 'w',
                     'Khai cuộc', 'best', 0, NULL, 0, 0, '[]', '2026-07-23');",
        )
        .expect("create legacy schema");
}

#[test]
fn upgrades_v061_data_without_losing_games_or_caches() {
    let connection = legacy_connection();
    initialize_database(&connection, false).expect("migrate database");

    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    let game: (String, String, String) = connection
        .query_row(
            "SELECT pgn, played_at, source_platform FROM saved_games WHERE id = 'game-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    let explanation: String = connection
        .query_row(
            "SELECT explanation FROM ai_explanations WHERE cache_key = 'cache-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let engine: (i64, i64) = connection
        .query_row(
            "SELECT depth, multipv FROM engine_analyses WHERE game_id = 'game-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();

    assert_eq!(version, CURRENT_SCHEMA_VERSION);
    assert!(game.0.contains("1. e4 e5"));
    assert_eq!(game.1, "2026-07-23");
    assert_eq!(game.2, "lichess");
    assert_eq!(explanation, "Giải thích cũ");
    assert_eq!(engine, (11, 2));
    initialize_database(&connection, false).expect("migration must be idempotent");
}

#[test]
fn creates_backup_before_file_database_migration() {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let directory = std::env::temp_dir().join(format!(
        "chess-coach-migration-test-{}-{unique}",
        std::process::id()
    ));
    fs::create_dir_all(&directory).unwrap();
    let database_path = directory.join("legacy.sqlite3");
    {
        let connection = Connection::open(&database_path).unwrap();
        create_legacy_schema(&connection);
    }

    let connection = open_database(&database_path, false).expect("open and migrate");
    let backup = directory.join("legacy.sqlite3.pre-v0.6.2.bak");
    assert!(backup.exists());
    assert_eq!(
        connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
            .unwrap(),
        CURRENT_SCHEMA_VERSION
    );

    drop(connection);
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn engine_cache_keeps_profiles_and_reads_highest_depth() {
    let connection = Connection::open_in_memory().unwrap();
    initialize_database(&connection, false).unwrap();
    for depth in [11, 13] {
        connection
            .execute(
                "INSERT INTO engine_analyses
                 (game_id, ply, engine_version, depth, multipv, result_json, color, phase,
                  quality, centipawn_loss, updated_at)
                 VALUES (?1, 1, ?2, ?3, 2, ?4, 'w', 'Khai cuộc', 'best', 0, datetime('now'))",
                params![
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    ENGINE_VERSION,
                    depth,
                    format!("{{\"depth\":{depth}}}")
                ],
            )
            .unwrap();
    }

    let stored = list_engine_analyses_connection(
        &connection,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    .unwrap();
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM engine_analyses", [], |row| row.get(0))
        .unwrap();

    assert_eq!(count, 2);
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].depth, 13);
}
