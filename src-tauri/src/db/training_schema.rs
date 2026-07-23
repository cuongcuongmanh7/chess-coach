use crate::*;

pub(crate) fn migrate_to_v3(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE training_cards (
            id TEXT PRIMARY KEY,
            profile_id INTEGER NOT NULL,
            game_id TEXT NOT NULL,
            ply INTEGER NOT NULL,
            engine_version TEXT NOT NULL,
            fen TEXT NOT NULL,
            side_to_move TEXT NOT NULL,
            played_move TEXT NOT NULL,
            best_move TEXT NOT NULL,
            best_line_json TEXT NOT NULL,
            quality TEXT NOT NULL,
            centipawn_loss REAL NOT NULL,
            phase TEXT NOT NULL,
            opening TEXT,
            tags_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'new',
            due_at TEXT NOT NULL,
            interval_days INTEGER NOT NULL DEFAULT 0,
            correct_streak INTEGER NOT NULL DEFAULT 0,
            attempts INTEGER NOT NULL DEFAULT 0,
            lapses INTEGER NOT NULL DEFAULT 0,
            starred INTEGER NOT NULL DEFAULT 0,
            suspended INTEGER NOT NULL DEFAULT 0,
            last_correct_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(profile_id, game_id, ply, engine_version)
         );
         CREATE INDEX idx_training_cards_queue
         ON training_cards(profile_id, suspended, due_at, status);
         CREATE INDEX idx_training_cards_game
         ON training_cards(game_id, profile_id);
         CREATE TABLE training_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id TEXT NOT NULL,
            attempted_move TEXT,
            result TEXT NOT NULL,
            centipawn_loss REAL,
            hints_used INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER,
            attempted_at TEXT NOT NULL
         );
         CREATE INDEX idx_training_attempts_card
         ON training_attempts(card_id, attempted_at DESC);
         CREATE TABLE training_progress_inbox (
            card_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            due_at TEXT NOT NULL,
            interval_days INTEGER NOT NULL,
            correct_streak INTEGER NOT NULL,
            attempts INTEGER NOT NULL,
            starred INTEGER NOT NULL,
            suspended INTEGER NOT NULL,
            updated_at TEXT NOT NULL
         );
         PRAGMA user_version = 3;",
    )
}
