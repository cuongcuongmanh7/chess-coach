use crate::*;

pub(crate) fn cloud_profile_by_key(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudPlayerProfile>> {
    connection
        .query_row(
            "SELECT platform, username, last_sync_at, created_at
             FROM player_profiles
             WHERE platform || '_' || lower(username) = ?1",
            params![document_id],
            |row| {
                Ok(CloudPlayerProfile {
                    platform: row.get(0)?,
                    username: row.get(1)?,
                    last_sync_at: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )
        .optional()
}

pub(crate) fn cloud_game_by_id(
    connection: &Connection,
    game_id: &str,
) -> rusqlite::Result<Option<CloudSavedGame>> {
    connection
        .query_row(
            "SELECT sg.id, sg.pgn, sg.white, sg.black, sg.white_elo, sg.black_elo,
                    sg.result, sg.event, sg.game_date, sg.played_at, sg.eco, sg.opening,
                    sg.time_control, sg.time_class, sg.source_url, sg.source_platform,
                    sg.created_at, sg.last_opened_at,
                    COALESCE((
                      SELECT GROUP_CONCAT(pp.platform || ':' || lower(pp.username), '|')
                      FROM game_profiles gp
                      JOIN player_profiles pp ON pp.id = gp.profile_id
                      WHERE gp.game_id = sg.id
                    ), '')
             FROM saved_games sg
             WHERE sg.id = ?1",
            params![game_id],
            |row| {
                let profile_keys: String = row.get(18)?;
                Ok(CloudSavedGame {
                    id: row.get(0)?,
                    pgn: row.get(1)?,
                    white: row.get(2)?,
                    black: row.get(3)?,
                    white_elo: row.get(4)?,
                    black_elo: row.get(5)?,
                    result: row.get(6)?,
                    event: row.get(7)?,
                    date: row.get(8)?,
                    played_at: row.get(9)?,
                    eco: row.get(10)?,
                    opening: row.get(11)?,
                    time_control: row.get(12)?,
                    time_class: row.get(13)?,
                    source_url: row.get(14)?,
                    source_platform: row.get(15)?,
                    created_at: row.get(16)?,
                    last_opened_at: row.get(17)?,
                    profile_keys: profile_keys
                        .split('|')
                        .filter(|value| !value.is_empty())
                        .map(str::to_string)
                        .collect(),
                })
            },
        )
        .optional()
}

pub(crate) fn pending_rows(
    connection: &Connection,
    entity_type: &str,
) -> Result<Vec<(String, i64, i64, String)>, String> {
    let mut statement = connection
        .prepare(
            "SELECT entity_id, generation, attempts, operation
             FROM cloud_sync_queue
             WHERE entity_type = ?1
             ORDER BY updated_at, entity_id",
        )
        .map_err(|_| "Không thể chuẩn bị hàng đợi cloud.".to_string())?;
    let rows = statement
        .query_map(params![entity_type], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|_| "Không thể đọc hàng đợi cloud.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Hàng đợi cloud không hợp lệ.".to_string())?;
    Ok(rows)
}

pub(crate) fn export_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
) -> Result<CloudSyncBatch, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở dữ liệu để đồng bộ.".to_string())?;

    let profiles = pending_rows(&connection, "profile")?
        .into_iter()
        .map(|(document_id, generation, attempts, operation)| {
            let deleted = operation == "delete";
            let data = if deleted {
                None
            } else {
                cloud_profile_by_key(&connection, &document_id)
                    .map_err(|_| "Không thể đọc hồ sơ đang chờ đồng bộ.".to_string())?
            };
            if !deleted && data.is_none() {
                return Err("Hồ sơ trong hàng đợi cloud không còn tồn tại.".to_string());
            }
            Ok(CloudPendingProfileChange {
                document_id,
                generation,
                attempts,
                deleted,
                data,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let games = pending_rows(&connection, "game")?
        .into_iter()
        .map(|(document_id, generation, attempts, operation)| {
            let deleted = operation == "delete";
            let data = if deleted {
                None
            } else {
                cloud_game_by_id(&connection, &document_id)
                    .map_err(|_| "Không thể đọc ván đang chờ đồng bộ.".to_string())?
            };
            if !deleted && data.is_none() {
                return Err("Ván trong hàng đợi cloud không còn tồn tại.".to_string());
            }
            Ok(CloudPendingGameChange {
                document_id,
                generation,
                attempts,
                deleted,
                data,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok(CloudSyncBatch { profiles, games })
}
