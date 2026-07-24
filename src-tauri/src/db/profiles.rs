use crate::*;

pub(crate) fn normalized_platform(value: Option<&str>) -> Option<&str> {
    match value {
        Some("chesscom") => Some("chesscom"),
        Some("lichess") => Some("lichess"),
        _ => None,
    }
}

pub(crate) fn pgn_header_value<'a>(pgn: &'a str, tag: &str) -> Option<&'a str> {
    let prefix = format!("[{tag} \"");
    pgn.lines().find_map(|line| {
        line.trim()
            .strip_prefix(&prefix)
            .and_then(|value| value.strip_suffix("\"]"))
    })
}

pub(crate) fn normalized_pgn_date(value: &str) -> Option<String> {
    let normalized = value.trim().replace('.', "-");
    let parts: Vec<&str> = normalized.split('-').collect();
    if parts.len() == 3
        && parts[0].len() == 4
        && parts[1].len() == 2
        && parts[2].len() == 2
        && parts
            .iter()
            .all(|part| part.chars().all(|character| character.is_ascii_digit()))
    {
        Some(normalized)
    } else {
        None
    }
}

pub(crate) fn normalized_pgn_time(value: &str) -> Option<String> {
    let parts: Vec<&str> = value.trim().split(':').collect();
    if (2..=3).contains(&parts.len())
        && parts
            .iter()
            .all(|part| part.len() == 2 && part.chars().all(|character| character.is_ascii_digit()))
    {
        Some(if parts.len() == 2 {
            format!("{}:00", value.trim())
        } else {
            value.trim().to_string()
        })
    } else {
        None
    }
}

pub(crate) fn played_at_from_pgn(pgn: &str) -> Option<String> {
    let date = ["UTCDate", "EndDate", "Date"]
        .iter()
        .find_map(|tag| pgn_header_value(pgn, tag).and_then(normalized_pgn_date))?;
    let time = ["UTCTime", "EndTime", "StartTime"]
        .iter()
        .find_map(|tag| pgn_header_value(pgn, tag).and_then(normalized_pgn_time));
    Some(time.map_or(date.clone(), |time| format!("{date} {time}")))
}

pub(crate) fn backfill_played_at(connection: &Connection) -> rusqlite::Result<()> {
    let missing = {
        let mut statement = connection
            .prepare("SELECT id, pgn FROM saved_games WHERE played_at IS NULL OR played_at = ''")?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (id, pgn) in missing {
        if let Some(played_at) = played_at_from_pgn(&pgn) {
            connection.execute(
                "UPDATE saved_games SET played_at = ?1 WHERE id = ?2",
                params![played_at, id],
            )?;
        }
    }
    Ok(())
}

pub(crate) fn list_player_profiles(
    database: tauri::State<'_, DatabaseState>,
) -> Result<Vec<PlayerProfileSummary>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT pp.id, pp.platform, pp.username, COUNT(gp.game_id), pp.last_sync_at, pp.created_at,
                    pp.sync_watermark, pp.sync_gap
             FROM player_profiles pp
             LEFT JOIN game_profiles gp ON gp.profile_id = pp.id
             GROUP BY pp.id
             ORDER BY pp.created_at, pp.id",
        )
        .map_err(|_| "Không thể đọc danh sách hồ sơ.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(PlayerProfileSummary {
                id: row.get(0)?,
                platform: row.get(1)?,
                username: row.get(2)?,
                game_count: row.get(3)?,
                last_sync_at: row.get(4)?,
                created_at: row.get(5)?,
                sync_watermark: row.get(6)?,
                sync_gap: row.get::<_, i64>(7)? != 0,
            })
        })
        .map_err(|_| "Không thể đọc hồ sơ người chơi.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu hồ sơ không hợp lệ.".to_string())
}

pub(crate) fn add_player_profile(
    database: tauri::State<'_, DatabaseState>,
    platform: String,
    username: String,
) -> Result<PlayerProfileSummary, String> {
    let platform = normalized_platform(Some(platform.as_str()))
        .ok_or_else(|| "Nền tảng hồ sơ không hợp lệ.".to_string())?;
    let username = username.trim();
    if !valid_username(username) {
        return Err("Username chỉ được chứa chữ, số, gạch ngang hoặc gạch dưới.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    connection
        .execute(
            "INSERT OR IGNORE INTO player_profiles (platform, username, created_at)
             VALUES (?1, ?2, datetime('now'))",
            params![platform, username],
        )
        .map_err(|_| "Không thể thêm hồ sơ.".to_string())?;
    let profile_id: i64 = connection
        .query_row(
            "SELECT id FROM player_profiles WHERE platform = ?1 AND username = ?2 COLLATE NOCASE",
            params![platform, username],
            |row| row.get(0),
        )
        .map_err(|_| "Không thể đọc hồ sơ vừa thêm.".to_string())?;
    connection
        .execute(
            "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
             SELECT sg.id, ?1,
                    CASE WHEN lower(sg.white) = lower(?2) THEN 'w' ELSE 'b' END,
                    datetime('now')
             FROM saved_games sg
             WHERE (lower(sg.white) = lower(?2) OR lower(sg.black) = lower(?2))
               AND (sg.source_platform IS NULL OR sg.source_platform = ?3)",
            params![profile_id, username, platform],
        )
        .map_err(|_| "Không thể liên kết các ván cũ với hồ sơ.".to_string())?;
    let cloud_key = profile_cloud_key(platform, username);
    queue_cloud_change(&connection, "profile", &cloud_key, "upsert")
        .map_err(|_| "Không thể xếp hồ sơ vào hàng đợi đồng bộ.".to_string())?;
    queue_games_for_profile(&connection, profile_id)
        .map_err(|_| "Không thể cập nhật hàng đợi ván của hồ sơ.".to_string())?;
    connection
        .query_row(
            "SELECT pp.id, pp.platform, pp.username, COUNT(gp.game_id), pp.last_sync_at, pp.created_at,
                    pp.sync_watermark, pp.sync_gap
             FROM player_profiles pp LEFT JOIN game_profiles gp ON gp.profile_id = pp.id
             WHERE pp.id = ?1 GROUP BY pp.id",
            params![profile_id],
            |row| {
                Ok(PlayerProfileSummary {
                    id: row.get(0)?,
                    platform: row.get(1)?,
                    username: row.get(2)?,
                    game_count: row.get(3)?,
                    last_sync_at: row.get(4)?,
                    created_at: row.get(5)?,
                    sync_watermark: row.get(6)?,
                    sync_gap: row.get::<_, i64>(7)? != 0,
                })
            },
        )
        .map_err(|_| "Không thể trả về hồ sơ vừa thêm.".to_string())
}

pub(crate) fn delete_player_profile(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<(), String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    let total: i64 = connection
        .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
        .map_err(|_| "Không thể kiểm tra số hồ sơ.".to_string())?;
    if total <= 1 {
        return Err("Cần giữ lại ít nhất một hồ sơ.".to_string());
    }
    let (platform, username): (String, String) = connection
        .query_row(
            "SELECT platform, username FROM player_profiles WHERE id = ?1",
            params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Không tìm thấy hồ sơ cần xoá.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu xoá hồ sơ.".to_string())?;
    remove_training_for_profile(&transaction, profile_id, true)?;
    queue_games_for_profile(&transaction, profile_id)
        .map_err(|_| "Không thể cập nhật các ván liên quan trong hàng đợi.".to_string())?;
    transaction
        .execute(
            "DELETE FROM game_profiles WHERE profile_id = ?1",
            params![profile_id],
        )
        .map_err(|_| "Không thể xoá liên kết hồ sơ.".to_string())?;
    transaction
        .execute(
            "DELETE FROM player_profiles WHERE id = ?1",
            params![profile_id],
        )
        .map_err(|_| "Không thể xoá hồ sơ.".to_string())?;
    let cloud_key = profile_cloud_key(&platform, &username);
    queue_cloud_change(&transaction, "profile", &cloud_key, "delete")
        .map_err(|_| "Không thể xếp thao tác xoá hồ sơ vào hàng đợi cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất xoá hồ sơ.".to_string())?;
    Ok(())
}

pub(crate) fn mark_profile_synced(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<(), String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    connection
        .execute(
            "UPDATE player_profiles SET last_sync_at = datetime('now') WHERE id = ?1",
            params![profile_id],
        )
        .map_err(|_| "Không thể cập nhật thời gian đồng bộ.".to_string())?;
    let (platform, username): (String, String) = connection
        .query_row(
            "SELECT platform, username FROM player_profiles WHERE id = ?1",
            params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Không thể đọc hồ sơ vừa đồng bộ.".to_string())?;
    queue_cloud_change(
        &connection,
        "profile",
        &profile_cloud_key(&platform, &username),
        "upsert",
    )
    .map_err(|_| "Không thể xếp hồ sơ vào hàng đợi cloud.".to_string())?;
    Ok(())
}

pub(crate) fn set_profile_sync_state(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
    watermark: Option<String>,
    gap: bool,
) -> Result<(), String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    connection
        .execute(
            "UPDATE player_profiles SET sync_watermark = ?2, sync_gap = ?3 WHERE id = ?1",
            params![profile_id, watermark, gap as i64],
        )
        .map_err(|_| "Không thể cập nhật mốc đồng bộ.".to_string())?;
    let (platform, username): (String, String) = connection
        .query_row(
            "SELECT platform, username FROM player_profiles WHERE id = ?1",
            params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Không thể đọc hồ sơ vừa cập nhật.".to_string())?;
    queue_cloud_change(
        &connection,
        "profile",
        &profile_cloud_key(&platform, &username),
        "upsert",
    )
    .map_err(|_| "Không thể xếp hồ sơ vào hàng đợi cloud.".to_string())?;
    Ok(())
}
