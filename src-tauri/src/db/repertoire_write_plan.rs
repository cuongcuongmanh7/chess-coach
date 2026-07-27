use crate::*;
use std::collections::{HashMap, HashSet};

/// Kế hoạch ghi đã tính sẵn, để mọi thao tác trong transaction là tất định và
/// các tập enqueue rời nhau (một `queue_cloud_change` cho mỗi doc id).
pub(crate) struct RepertoireSavePlan {
    pub(crate) repertoire_id: String,
    pub(crate) family_name: String,
    /// Các repertoire local khác cùng (hồ sơ, màu, family) cần gộp vào `repertoire_id`.
    /// Không phát tombstone cho chúng: chúng dùng CHUNG doc id với bản survivor.
    pub(crate) loser_ids: Vec<String>,
    pub(crate) key_to_id: HashMap<String, String>,
    /// Node cũ của `repertoire_id` không còn trong seed set và không phải biến thủ công.
    pub(crate) stale_node_ids: Vec<String>,
}

pub(crate) fn build_save_plan(
    connection: &Connection,
    request: &SaveRepertoireRequest,
) -> Result<RepertoireSavePlan, String> {
    validate_request(connection, request)?;
    let family_name = repertoire_family_name(request.name.trim()).to_string();
    let repertoire_id = repertoire_doc_id_for_profile(
        connection,
        request.profile_id,
        &request.color,
        &family_name,
    )?;
    let loser_ids = matching_repertoire_ids(connection, request, &family_name)?
        .into_iter()
        .filter(|id| id != &repertoire_id)
        .collect();
    let key_to_id = build_node_ids(&repertoire_id, request)?;
    let new_node_ids: HashSet<&str> = key_to_id.values().map(String::as_str).collect();
    let stale_node_ids = stale_node_ids(connection, &repertoire_id, &new_node_ids)?;
    Ok(RepertoireSavePlan {
        repertoire_id,
        family_name,
        loser_ids,
        key_to_id,
        stale_node_ids,
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

/// Lọc family trong Rust bằng `repertoire_family_key` thay vì lặp lại biểu thức
/// `instr(name, ':')` trong SQL: hai cách chuẩn hóa lệch nhau sẽ làm hai thiết bị
/// sinh ra hai doc id khác nhau cho cùng một family.
fn matching_repertoire_ids(
    connection: &Connection,
    request: &SaveRepertoireRequest,
    family_name: &str,
) -> Result<Vec<String>, String> {
    let family_key = repertoire_family_key(family_name);
    let mut statement = connection
        .prepare(
            "SELECT r.id, r.name,
                    (SELECT COUNT(*) FROM repertoire_nodes n
                       JOIN repertoire_progress p ON p.node_id = n.id
                      WHERE n.repertoire_id = r.id),
                    r.updated_at
             FROM repertoires r
             WHERE r.profile_id = ?1 AND r.color = ?2",
        )
        .map_err(|_| "Không thể tìm repertoire hiện có.".to_string())?;
    let rows = statement
        .query_map(params![request.profile_id, request.color], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|_| "Không thể đọc repertoire hiện có.".to_string())?;
    let mut matches = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu repertoire hiện có không hợp lệ.".to_string())?
        .into_iter()
        .filter(|(_, name, _, _)| repertoire_family_key(name) == family_key)
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        right
            .2
            .cmp(&left.2)
            .then_with(|| right.3.cmp(&left.3))
            .then_with(|| left.0.cmp(&right.0))
    });
    Ok(matches.into_iter().map(|(id, _, _, _)| id).collect())
}

fn build_node_ids(
    repertoire_id: &str,
    request: &SaveRepertoireRequest,
) -> Result<HashMap<String, String>, String> {
    let mut ids = HashMap::new();
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

/// Biến thủ công (`source = 'manual'`) được giữ lại: đó là dữ liệu người dùng tự
/// nhập, không tái tạo được từ lịch sử ván, và nếu tombstone thì sẽ mất trên MỌI
/// thiết bị chứ không chỉ máy đang rebuild.
fn stale_node_ids(
    connection: &Connection,
    repertoire_id: &str,
    new_node_ids: &HashSet<&str>,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id FROM repertoire_nodes
             WHERE repertoire_id = ?1 AND source <> 'manual'",
        )
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
