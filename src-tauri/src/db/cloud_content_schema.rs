use crate::*;

pub(crate) fn analysis_cloud_id(
    game_id: &str,
    ply: u32,
    engine_version: &str,
    depth: u32,
    multipv: u32,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!(
        "{game_id}:{ply}:{engine_version}:{depth}:{multipv}"
    ));
    format!("{:x}", hasher.finalize())
}

pub(crate) fn analysis_manifest_cloud_id(
    game_id: &str,
    engine_version: &str,
    multipv: u32,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{game_id}:{engine_version}:{multipv}"));
    format!("{:x}", hasher.finalize())
}

fn backfill_engine_cloud_ids(connection: &Connection) -> rusqlite::Result<()> {
    let rows = {
        let mut statement = connection.prepare(
            "SELECT game_id, ply, engine_version, depth, multipv
             FROM engine_analyses WHERE cloud_id IS NULL OR cloud_id = ''",
        )?;
        let values = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, u32>(3)?,
                    row.get::<_, u32>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        values
    };
    for (game_id, ply, engine_version, depth, multipv) in rows {
        let cloud_id = analysis_cloud_id(&game_id, ply, &engine_version, depth, multipv);
        connection.execute(
            "UPDATE engine_analyses SET cloud_id = ?6
             WHERE game_id = ?1 AND ply = ?2 AND engine_version = ?3
               AND depth = ?4 AND multipv = ?5",
            params![game_id, ply, engine_version, depth, multipv, cloud_id],
        )?;
    }
    Ok(())
}

fn backfill_analysis_manifests(connection: &Connection) -> rusqlite::Result<()> {
    let rows = {
        let mut statement = connection.prepare(
            "SELECT sg.id, MAX(ea.ply), COALESCE(sg.analyzed_at, datetime('now'))
             FROM saved_games sg
             JOIN engine_analyses ea ON ea.game_id = sg.id
             WHERE sg.analysis_complete = 1
               AND ea.engine_version = ?1 AND ea.multipv = ?2
             GROUP BY sg.id",
        )?;
        let values = statement
            .query_map(params![ENGINE_VERSION, engine_multipv()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        values
    };
    for (game_id, ply_count, completed_at) in rows {
        let cloud_id =
            analysis_manifest_cloud_id(&game_id, ENGINE_VERSION, engine_multipv() as u32);
        connection.execute(
            "INSERT OR IGNORE INTO analysis_manifests
             (cloud_id, game_id, engine_version, multipv, ply_count, completed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![
                cloud_id,
                game_id,
                ENGINE_VERSION,
                engine_multipv(),
                ply_count,
                completed_at
            ],
        )?;
    }
    Ok(())
}

fn backfill_training_attempt_cloud_ids(connection: &Connection) -> rusqlite::Result<()> {
    let rows = {
        let mut statement = connection.prepare(
            "SELECT id, card_id, attempted_move, result, centipawn_loss, hints_used,
                    failed_attempts, duration_ms, attempted_at
             FROM training_attempts WHERE cloud_id IS NULL OR cloud_id = ''",
        )?;
        let values = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, u32>(5)?,
                    row.get::<_, u32>(6)?,
                    row.get::<_, Option<u64>>(7)?,
                    row.get::<_, String>(8)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        values
    };
    for (id, card_id, move_value, result, loss, hints, failed, duration, attempted_at) in rows {
        let mut hasher = Sha256::new();
        hasher.update(format!(
            "{id}:{card_id}:{move_value:?}:{result}:{loss:?}:{hints}:{failed}:{duration:?}:{attempted_at}"
        ));
        let cloud_id = format!("{:x}", hasher.finalize());
        connection.execute(
            "UPDATE training_attempts SET cloud_id = ?2 WHERE id = ?1",
            params![id, cloud_id],
        )?;
    }
    Ok(())
}

fn queue_existing_cloud_content(connection: &Connection) -> rusqlite::Result<()> {
    for (entity_type, table, id_column, condition) in [
        (
            "engine_analysis",
            "engine_analyses",
            "cloud_id",
            "length(game_id) = 64",
        ),
        (
            "analysis_manifest",
            "analysis_manifests",
            "cloud_id",
            "length(game_id) = 64",
        ),
        (
            "training_attempt",
            "training_attempts",
            "cloud_id",
            "length(cloud_id) = 64",
        ),
        (
            "ai_explanation",
            "ai_explanations",
            "cache_key",
            "length(cache_key) = 64",
        ),
        (
            "training_progress",
            "training_cards",
            "id",
            "length(id) = 64",
        ),
    ] {
        let sql = format!("SELECT {id_column} FROM {table} WHERE {condition}");
        let ids = {
            let mut statement = connection.prepare(&sql)?;
            let values = statement
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            values
        };
        for id in ids {
            queue_cloud_change(connection, entity_type, &id, "upsert")?;
        }
    }
    Ok(())
}

pub(crate) fn migrate_to_v6(connection: &Connection) -> rusqlite::Result<()> {
    add_column_if_missing(connection, "engine_analyses", "cloud_id", "TEXT")?;
    add_column_if_missing(connection, "training_attempts", "cloud_id", "TEXT")?;
    add_column_if_missing(
        connection,
        "training_attempts",
        "failed_attempts",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(
        connection,
        "training_progress_inbox",
        "lapses",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(
        connection,
        "training_progress_inbox",
        "last_correct_at",
        "TEXT",
    )?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS analysis_manifests (
            cloud_id TEXT PRIMARY KEY,
            game_id TEXT NOT NULL,
            engine_version TEXT NOT NULL,
            multipv INTEGER NOT NULL,
            ply_count INTEGER NOT NULL,
            completed_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(game_id, engine_version, multipv)
         );
         CREATE INDEX IF NOT EXISTS idx_analysis_manifests_game
         ON analysis_manifests(game_id, engine_version, multipv);
         ",
    )?;
    backfill_engine_cloud_ids(connection)?;
    backfill_training_attempt_cloud_ids(connection)?;
    connection.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_engine_analyses_cloud_id
         ON engine_analyses(cloud_id);
         CREATE UNIQUE INDEX IF NOT EXISTS idx_training_attempts_cloud_id
         ON training_attempts(cloud_id);",
    )?;
    backfill_analysis_manifests(connection)?;
    queue_existing_cloud_content(connection)?;
    connection.execute_batch("PRAGMA user_version = 6;")
}
