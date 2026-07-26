use crate::*;

pub(crate) fn migrate_to_v8(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS repertoires (
            id TEXT PRIMARY KEY,
            profile_id INTEGER NOT NULL,
            color TEXT NOT NULL,
            name TEXT NOT NULL,
            eco TEXT,
            source TEXT NOT NULL DEFAULT 'history',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_repertoires_profile
         ON repertoires(profile_id, color);
         CREATE TABLE IF NOT EXISTS repertoire_nodes (
            id TEXT PRIMARY KEY,
            repertoire_id TEXT NOT NULL,
            parent_id TEXT,
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
            UNIQUE(repertoire_id, parent_id, move_uci)
         );
         CREATE INDEX IF NOT EXISTS idx_repertoire_nodes_tree
         ON repertoire_nodes(repertoire_id, parent_id);
         CREATE INDEX IF NOT EXISTS idx_repertoire_nodes_pos
         ON repertoire_nodes(repertoire_id, position_key);
         CREATE TABLE IF NOT EXISTS repertoire_progress (
            node_id TEXT PRIMARY KEY,
            profile_id INTEGER NOT NULL,
            correct_count INTEGER NOT NULL DEFAULT 0,
            wrong_count INTEGER NOT NULL DEFAULT 0,
            correct_streak INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'new',
            interval_days INTEGER NOT NULL DEFAULT 0,
            due_at TEXT NOT NULL,
            last_correct_at TEXT,
            updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_repertoire_progress_due
         ON repertoire_progress(profile_id, due_at);
         PRAGMA user_version = 8;",
    )
}
