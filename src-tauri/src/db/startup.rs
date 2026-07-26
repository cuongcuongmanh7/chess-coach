use crate::*;

pub(crate) fn resume_last_opened_game(
    database: tauri::State<'_, DatabaseState>,
    profile_id: Option<i64>,
) -> Result<Option<SavedGameDetail>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    resume_last_opened_game_connection(&connection, profile_id)
}

fn resume_last_opened_game_connection(
    connection: &Connection,
    profile_id: Option<i64>,
) -> Result<Option<SavedGameDetail>, String> {
    connection
        .query_row(
            "SELECT id, pgn
             FROM saved_games sg
             WHERE ?1 IS NULL OR EXISTS (
               SELECT 1 FROM game_profiles gp WHERE gp.game_id = sg.id AND gp.profile_id = ?1
             )
             ORDER BY last_opened_at DESC, created_at DESC
             LIMIT 1",
            params![profile_id],
            |row| {
                Ok(SavedGameDetail {
                    id: row.get(0)?,
                    pgn: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|_| "Không thể đọc ván được mở gần nhất.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn insert_game(connection: &Connection, id: &str, pgn: &str, opened_at: &str) {
        connection
            .execute(
                "INSERT INTO saved_games
                 (id, pgn, white, black, created_at, last_opened_at)
                 VALUES (?1, ?2, 'White', 'Black', ?3, ?3)",
                params![id, pgn, opened_at],
            )
            .unwrap();
    }

    #[test]
    fn resumes_most_recently_opened_game_without_mutating_timestamp() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection, false).unwrap();
        insert_game(&connection, "older", "1. d4 d5", "2026-07-24 10:00:00");
        insert_game(&connection, "recent", "1. e4 e5", "2026-07-25 10:00:00");

        let resumed = resume_last_opened_game_connection(&connection, None)
            .unwrap()
            .unwrap();
        let opened_at: String = connection
            .query_row(
                "SELECT last_opened_at FROM saved_games WHERE id = 'recent'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(resumed.id, "recent");
        assert_eq!(opened_at, "2026-07-25 10:00:00");
    }

    #[test]
    fn limits_resume_to_active_profile() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection, false).unwrap();
        insert_game(
            &connection,
            "profile-one",
            "1. d4 d5",
            "2026-07-24 10:00:00",
        );
        insert_game(
            &connection,
            "profile-two",
            "1. e4 e5",
            "2026-07-25 10:00:00",
        );
        connection
            .execute(
                "INSERT INTO player_profiles
                 (id, platform, username, created_at)
                 VALUES (1, 'chesscom', 'player-one', datetime('now')),
                        (2, 'lichess', 'player-two', datetime('now'))",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO game_profiles (game_id, profile_id, player_color, linked_at)
                 VALUES ('profile-one', 1, 'w', datetime('now')),
                        ('profile-two', 2, 'w', datetime('now'))",
                [],
            )
            .unwrap();

        let resumed = resume_last_opened_game_connection(&connection, Some(1))
            .unwrap()
            .unwrap();

        assert_eq!(resumed.id, "profile-one");
    }
}
