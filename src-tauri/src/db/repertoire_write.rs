use crate::*;

pub(crate) fn save_repertoire_connection(
    connection: &mut Connection,
    request: SaveRepertoireRequest,
) -> Result<SaveRepertoireResult, String> {
    validate_request(connection, &request)?;
    let name = opening_family_name(request.name.trim());
    let matching_ids = matching_repertoire_ids(connection, &request, name)?;
    let repertoire_id = match matching_ids.first() {
        Some(id) => id.clone(),
        None => connection
            .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
            .map_err(|_| "Không thể tạo mã repertoire.".to_string())?,
    };
    let key_to_id = build_node_ids(&repertoire_id, &request)?;
    let new_node_ids: std::collections::HashSet<&str> =
        key_to_id.values().map(String::as_str).collect();
    let stale_node_ids = stale_node_ids(connection, &repertoire_id, &new_node_ids)?;

    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu lưu repertoire.".to_string())?;
    remove_duplicate_repertoires(&transaction, matching_ids.get(1..).unwrap_or_default())?;
    for node_id in stale_node_ids {
        transaction
            .execute(
                "DELETE FROM repertoire_progress WHERE node_id = ?1",
                params![node_id],
            )
            .map_err(|_| "Không thể dọn tiến độ node cũ.".to_string())?;
    }
    transaction
        .execute(
            "DELETE FROM repertoire_nodes WHERE repertoire_id = ?1",
            params![repertoire_id],
        )
        .map_err(|_| "Không thể cập nhật cây repertoire.".to_string())?;
    transaction
        .execute(
            "INSERT INTO repertoires
               (id, profile_id, color, name, eco, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'history',
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               eco = excluded.eco,
               source = excluded.source,
               updated_at = excluded.updated_at",
            params![
                repertoire_id,
                request.profile_id,
                request.color,
                name,
                request.eco,
            ],
        )
        .map_err(|_| "Không thể lưu repertoire.".to_string())?;

    let mut node_count = 0usize;
    for seed in &request.nodes {
        let node_id = key_to_id
            .get(&seed.node_key)
            .ok_or_else(|| "Không thể ánh xạ node.".to_string())?;
        let parent_id = seed
            .parent_key
            .as_ref()
            .map(|key| {
                key_to_id
                    .get(key)
                    .cloned()
                    .ok_or_else(|| "Không tìm thấy node cha.".to_string())
            })
            .transpose()?;
        node_count += transaction
            .execute(
                "INSERT OR IGNORE INTO repertoire_nodes
                 (id, repertoire_id, parent_id, position_key, fen, move_san, move_uci,
                  side_to_move, is_user_move, source, frequency, avg_cpl, comment, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                params![
                    node_id,
                    repertoire_id,
                    parent_id,
                    seed.position_key,
                    seed.fen,
                    seed.move_san,
                    seed.move_uci,
                    seed.side_to_move,
                    i64::from(seed.is_user_move),
                    seed.source,
                    seed.frequency,
                    seed.avg_cpl,
                    seed.comment,
                ],
            )
            .map_err(|_| "Không thể lưu node repertoire.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu repertoire.".to_string())?;
    Ok(SaveRepertoireResult {
        repertoire_id,
        node_count,
    })
}

fn validate_request(
    connection: &Connection,
    request: &SaveRepertoireRequest,
) -> Result<(), String> {
    if request.color != "w" && request.color != "b" {
        return Err("Màu quân không hợp lệ.".to_string());
    }
    if request.name.trim().is_empty() || request.name.len() > 120 {
        return Err("Tên repertoire không hợp lệ.".to_string());
    }
    if request.nodes.is_empty() || request.nodes.len() > 5_000 {
        return Err("Số node repertoire vượt giới hạn an toàn.".to_string());
    }
    if request
        .nodes
        .iter()
        .any(|seed| seed.fen.is_empty() || seed.fen.len() > 200 || seed.move_uci.is_empty())
    {
        return Err("Dữ liệu node repertoire không hợp lệ.".to_string());
    }
    let profile_exists = connection
        .query_row(
            "SELECT 1 FROM player_profiles WHERE id = ?1",
            params![request.profile_id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|_| "Không thể kiểm tra hồ sơ.".to_string())?
        .unwrap_or(false);
    if !profile_exists {
        return Err("Hồ sơ không tồn tại.".to_string());
    }
    Ok(())
}

fn matching_repertoire_ids(
    connection: &Connection,
    request: &SaveRepertoireRequest,
    name: &str,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT r.id
             FROM repertoires r
             WHERE r.profile_id = ?1 AND r.color = ?2
               AND lower(trim(
                 CASE WHEN instr(r.name, ':') > 0
                   THEN substr(r.name, 1, instr(r.name, ':') - 1)
                   ELSE r.name
                 END
               )) = lower(?3)
             ORDER BY
               (SELECT COUNT(*) FROM repertoire_nodes n
                JOIN repertoire_progress p ON p.node_id = n.id
                WHERE n.repertoire_id = r.id) DESC,
               r.updated_at DESC",
        )
        .map_err(|_| "Không thể tìm repertoire hiện có.".to_string())?;
    let rows = statement
        .query_map(params![request.profile_id, request.color, name], |row| {
            row.get(0)
        })
        .map_err(|_| "Không thể đọc repertoire hiện có.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu repertoire hiện có không hợp lệ.".to_string())
}

fn opening_family_name(name: &str) -> &str {
    name.split_once(':')
        .map_or(name, |(family, _)| family)
        .trim()
}

fn build_node_ids(
    repertoire_id: &str,
    request: &SaveRepertoireRequest,
) -> Result<std::collections::HashMap<String, String>, String> {
    let mut ids = std::collections::HashMap::new();
    for seed in &request.nodes {
        ids.insert(
            seed.node_key.clone(),
            repertoire_node_id(repertoire_id, &seed.node_key),
        );
    }
    for seed in &request.nodes {
        if seed
            .parent_key
            .as_ref()
            .is_some_and(|parent| !ids.contains_key(parent))
        {
            return Err("Không tìm thấy node cha.".to_string());
        }
    }
    Ok(ids)
}

fn stale_node_ids(
    connection: &Connection,
    repertoire_id: &str,
    new_node_ids: &std::collections::HashSet<&str>,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("SELECT id FROM repertoire_nodes WHERE repertoire_id = ?1")
        .map_err(|_| "Không thể đọc cây repertoire cũ.".to_string())?;
    let rows = statement
        .query_map(params![repertoire_id], |row| row.get::<_, String>(0))
        .map_err(|_| "Không thể đọc node repertoire cũ.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map(|ids| {
            ids.into_iter()
                .filter(|id| !new_node_ids.contains(id.as_str()))
                .collect()
        })
        .map_err(|_| "Dữ liệu node repertoire cũ không hợp lệ.".to_string())
}

fn remove_duplicate_repertoires(
    transaction: &rusqlite::Transaction<'_>,
    duplicate_ids: &[String],
) -> Result<(), String> {
    for id in duplicate_ids {
        transaction
            .execute(
                "DELETE FROM repertoire_progress WHERE node_id IN
                   (SELECT id FROM repertoire_nodes WHERE repertoire_id = ?1)",
                params![id],
            )
            .map_err(|_| "Không thể gộp tiến độ repertoire trùng.".to_string())?;
        transaction
            .execute(
                "DELETE FROM repertoire_nodes WHERE repertoire_id = ?1",
                params![id],
            )
            .map_err(|_| "Không thể gộp node repertoire trùng.".to_string())?;
        transaction
            .execute("DELETE FROM repertoires WHERE id = ?1", params![id])
            .map_err(|_| "Không thể gộp repertoire trùng.".to_string())?;
    }
    Ok(())
}
