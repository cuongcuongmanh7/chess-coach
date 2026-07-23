use crate::*;

pub(crate) const CURRENT_SCHEMA_VERSION: i64 = 2;
const ENGINE_MULTIPV: i64 = 2;

pub(crate) fn open_database(
    path: &Path,
    seed_default_profiles: bool,
) -> rusqlite::Result<Connection> {
    let existed = path.exists();
    let connection = Connection::open(path)?;
    let version = schema_version(&connection)?;

    if existed && version < CURRENT_SCHEMA_VERSION {
        let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or("database");
        let backup_path = path.with_file_name(format!("{file_name}.pre-v0.6.2.bak"));
        if !backup_path.exists() {
            connection.backup(DatabaseName::Main, &backup_path, None)?;
        }
    }

    initialize_database(&connection, seed_default_profiles)?;
    Ok(connection)
}

pub(crate) fn initialize_database(
    connection: &Connection,
    seed_default_profiles: bool,
) -> rusqlite::Result<()> {
    let version = schema_version(connection)?;
    if version > CURRENT_SCHEMA_VERSION {
        return Err(rusqlite::Error::InvalidQuery);
    }
    if version < 1 {
        migrate_to_v1(connection, seed_default_profiles)?;
    }
    if schema_version(connection)? < 2 {
        migrate_to_v2(connection)?;
    }
    Ok(())
}

fn schema_version(connection: &Connection) -> rusqlite::Result<i64> {
    connection.query_row("PRAGMA user_version", [], |row| row.get(0))
}

fn table_has_column(
    connection: &Connection,
    table: &str,
    column: &str,
) -> rusqlite::Result<bool> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for value in columns {
        if value? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn add_column_if_missing(
    connection: &Connection,
    table: &str,
    column: &str,
    declaration: &str,
) -> rusqlite::Result<()> {
    if !table_has_column(connection, table, column)? {
        connection.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {declaration}"),
            [],
        )?;
    }
    Ok(())
}

fn migrate_to_v1(
    connection: &Connection,
    seed_default_profiles: bool,
) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS ai_explanations (
            cache_key TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
            prompt_version TEXT NOT NULL, explanation TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_explanations_provider_model
        ON ai_explanations(provider, model);
        CREATE TABLE IF NOT EXISTS saved_games (
            id TEXT PRIMARY KEY, pgn TEXT NOT NULL, white TEXT NOT NULL, black TEXT NOT NULL,
            white_elo TEXT, black_elo TEXT, result TEXT, event TEXT, game_date TEXT,
            played_at TEXT, eco TEXT, opening TEXT, time_control TEXT, time_class TEXT,
            source_url TEXT, source_platform TEXT,
            analysis_complete INTEGER NOT NULL DEFAULT 0, analyzed_at TEXT,
            created_at TEXT NOT NULL, last_opened_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_saved_games_last_opened
        ON saved_games(last_opened_at DESC);
        CREATE TABLE IF NOT EXISTS engine_analyses (
            game_id TEXT NOT NULL, ply INTEGER NOT NULL, engine_version TEXT NOT NULL,
            depth INTEGER NOT NULL, result_json TEXT NOT NULL, color TEXT NOT NULL,
            phase TEXT NOT NULL, quality TEXT NOT NULL, centipawn_loss REAL NOT NULL,
            think_time_seconds REAL, is_quick INTEGER NOT NULL DEFAULT 0,
            is_time_pressure INTEGER NOT NULL DEFAULT 0,
            tags_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL,
            PRIMARY KEY(game_id, ply, engine_version)
        );
        CREATE INDEX IF NOT EXISTS idx_engine_analyses_game
        ON engine_analyses(game_id, engine_version, ply);
        CREATE TABLE IF NOT EXISTS player_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL,
            username TEXT NOT NULL, last_sync_at TEXT, created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profiles_identity
        ON player_profiles(platform, username COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS game_profiles (
            game_id TEXT NOT NULL, profile_id INTEGER NOT NULL, player_color TEXT NOT NULL,
            linked_at TEXT NOT NULL, PRIMARY KEY(game_id, profile_id)
        );
        CREATE INDEX IF NOT EXISTS idx_game_profiles_profile
        ON game_profiles(profile_id, game_id);
        CREATE TABLE IF NOT EXISTS cloud_sync_queue (
            entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL,
            generation INTEGER NOT NULL DEFAULT 1, attempts INTEGER NOT NULL DEFAULT 0,
            next_retry_at TEXT, last_error TEXT, updated_at TEXT NOT NULL,
            PRIMARY KEY(entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_sync_queue_retry
        ON cloud_sync_queue(next_retry_at, updated_at);
        CREATE TABLE IF NOT EXISTS cloud_sync_cursors (
            uid TEXT NOT NULL, collection_name TEXT NOT NULL,
            initialized INTEGER NOT NULL DEFAULT 0, updated_at_seconds INTEGER,
            updated_at_nanoseconds INTEGER, document_id TEXT,
            PRIMARY KEY(uid, collection_name)
        );
        CREATE TABLE IF NOT EXISTS app_metadata (
            key TEXT PRIMARY KEY, value TEXT NOT NULL
        );",
    )?;

    for (column, declaration) in [
        ("opening", "TEXT"),
        ("time_class", "TEXT"),
        ("analysis_complete", "INTEGER NOT NULL DEFAULT 0"),
        ("analyzed_at", "TEXT"),
        ("source_platform", "TEXT"),
        ("played_at", "TEXT"),
    ] {
        add_column_if_missing(connection, "saved_games", column, declaration)?;
    }
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_saved_games_played_at ON saved_games(played_at DESC)",
        [],
    )?;
    backfill_played_at(connection)?;
    connection.execute(
        "UPDATE saved_games SET source_platform = CASE
           WHEN source_url LIKE '%lichess.org%' THEN 'lichess'
           WHEN source_url LIKE '%chess.com%' THEN 'chesscom'
           ELSE source_platform END
         WHERE source_platform IS NULL",
        [],
    )?;
    seed_profiles_and_cloud_queue(connection, seed_default_profiles)?;
    connection.execute_batch("PRAGMA user_version = 1;")?;
    Ok(())
}

fn seed_profiles_and_cloud_queue(
    connection: &Connection,
    seed_default_profiles: bool,
) -> rusqlite::Result<()> {
    let profile_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))?;
    if seed_default_profiles && profile_count == 0 {
        connection.execute_batch(
            "INSERT INTO player_profiles (platform, username, created_at)
             VALUES ('chesscom', 'Cuongkool', datetime('now'));
             INSERT INTO player_profiles (platform, username, created_at)
             VALUES ('lichess', 'chinsu1409', datetime('now'));",
        )?;
    }
    connection.execute(
        "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
         SELECT sg.id, pp.id,
                CASE WHEN lower(sg.white) = lower(pp.username) THEN 'w' ELSE 'b' END,
                datetime('now')
         FROM saved_games sg JOIN player_profiles pp
           ON lower(sg.white) = lower(pp.username) OR lower(sg.black) = lower(pp.username)
         WHERE sg.source_platform IS NULL OR sg.source_platform = pp.platform",
        [],
    )?;
    let initialized: Option<String> = connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'cloud_sync_queue_initialized'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if initialized.is_none() {
        connection.execute_batch(
            "INSERT OR IGNORE INTO cloud_sync_queue
             (entity_type, entity_id, operation, generation, attempts, updated_at)
             SELECT 'profile', platform || '_' || lower(username), 'upsert', 1, 0,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM player_profiles;
             INSERT OR IGNORE INTO cloud_sync_queue
             (entity_type, entity_id, operation, generation, attempts, updated_at)
             SELECT 'game', id, 'upsert', 1, 0,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM saved_games;
             INSERT INTO app_metadata(key, value)
             VALUES ('cloud_sync_queue_initialized', '2');",
        )?;
    }
    Ok(())
}

fn migrate_to_v2(connection: &Connection) -> rusqlite::Result<()> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute_batch(
        "ALTER TABLE engine_analyses RENAME TO engine_analyses_v1;
         CREATE TABLE engine_analyses (
            game_id TEXT NOT NULL, ply INTEGER NOT NULL, engine_version TEXT NOT NULL,
            depth INTEGER NOT NULL, multipv INTEGER NOT NULL,
            result_json TEXT NOT NULL, color TEXT NOT NULL, phase TEXT NOT NULL,
            quality TEXT NOT NULL, centipawn_loss REAL NOT NULL, think_time_seconds REAL,
            is_quick INTEGER NOT NULL DEFAULT 0, is_time_pressure INTEGER NOT NULL DEFAULT 0,
            tags_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL,
            PRIMARY KEY(game_id, ply, engine_version, depth, multipv)
         );
         INSERT INTO engine_analyses
         (game_id, ply, engine_version, depth, multipv, result_json, color, phase, quality,
          centipawn_loss, think_time_seconds, is_quick, is_time_pressure, tags_json, updated_at)
         SELECT game_id, ply, engine_version, depth, 2, result_json, color, phase, quality,
                centipawn_loss, think_time_seconds, is_quick, is_time_pressure,
                tags_json, updated_at
         FROM engine_analyses_v1;
         DROP TABLE engine_analyses_v1;
         CREATE INDEX idx_engine_analyses_game
         ON engine_analyses(game_id, engine_version, multipv, ply, depth DESC);
         PRAGMA user_version = 2;",
    )?;
    transaction.commit()
}

pub(crate) fn engine_multipv() -> i64 {
    ENGINE_MULTIPV
}
