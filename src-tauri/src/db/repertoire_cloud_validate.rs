use crate::*;
use rusqlite::Transaction;

const VALID_STATUSES: [&str; 4] = ["new", "learning", "review", "mastered"];

pub(crate) fn valid_hex_id(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

/// Doc id phải derive lại đúng từ payload: nhờ vậy một máy khác không thể ghi
/// dữ liệu của family/hồ sơ khác vào doc này.
pub(crate) fn valid_repertoire(data: &CloudRepertoire, document_id: &str) -> bool {
    data.cloud_id == document_id
        && matches!(data.color.as_str(), "w" | "b")
        && !data.name.trim().is_empty()
        && data.name.len() <= 120
        && data.profile_key.len() <= 160
        && data.profile_key.contains(':')
        && data.eco.as_ref().is_none_or(|value| value.len() <= 16)
        && data.source.len() <= 40
        && data.created_at.len() <= 64
        && data.updated_at.len() <= 64
        && !data.updated_at.is_empty()
        && repertoire_doc_id(
            &data.profile_key,
            &data.color,
            &repertoire_family_key(&data.name),
        ) == document_id
}

pub(crate) fn valid_node(data: &CloudRepertoireNode, document_id: &str) -> bool {
    data.cloud_id == document_id
        && valid_hex_id(&data.repertoire_cloud_id)
        && data.node_key == format!("{}|{}", data.position_key, data.move_uci)
        && repertoire_node_id(&data.repertoire_cloud_id, &data.node_key) == document_id
        && !data.position_key.is_empty()
        && data.position_key.len() <= 200
        && !data.fen.is_empty()
        && data.fen.len() <= 200
        && data.move_san.len() <= 16
        && !data.move_uci.is_empty()
        && data.move_uci.len() <= 10
        && matches!(data.side_to_move.as_str(), "w" | "b")
        && data.source.len() <= 40
        && (0..=1_000_000_000).contains(&data.frequency)
        && data.avg_cpl.is_none_or(f64::is_finite)
        && data.comment.as_ref().is_none_or(|value| value.len() <= 2_000)
        && data.created_at.len() <= 64
        && data.updated_at.len() <= 64
        && !data.updated_at.is_empty()
        && data
            .parent_node_key
            .as_ref()
            .is_none_or(|value| !value.is_empty() && value.len() <= 220)
}

pub(crate) fn valid_progress(data: &CloudRepertoireProgress, document_id: &str) -> bool {
    data.node_cloud_id == document_id
        && valid_hex_id(document_id)
        && valid_hex_id(&data.repertoire_cloud_id)
        && data.profile_key.len() <= 160
        && data.profile_key.contains(':')
        && VALID_STATUSES.contains(&data.status.as_str())
        && (0..=1_000_000_000).contains(&data.correct_count)
        && (0..=1_000_000_000).contains(&data.wrong_count)
        && (0..=1_000_000_000).contains(&data.correct_streak)
        && (0..=90).contains(&data.interval_days)
        && !data.due_at.is_empty()
        && data.due_at.len() <= 64
        && data
            .last_correct_at
            .as_ref()
            .is_none_or(|value| value.len() <= 64)
        && data.updated_at.len() <= 64
        && !data.updated_at.is_empty()
}

/// `profile_key` dạng `platform:username_lower` → `player_profiles.id`.
/// Trả `None` khi hồ sơ chưa có ở máy này (profiles được merge trước trong cùng
/// transaction, nên chỉ xảy ra với hồ sơ thực sự lạ).
pub(crate) fn resolve_profile_id(
    transaction: &Transaction<'_>,
    profile_key: &str,
) -> Result<Option<i64>, String> {
    let Some((platform, username)) = profile_key.split_once(':') else {
        return Ok(None);
    };
    transaction
        .query_row(
            "SELECT id FROM player_profiles
             WHERE platform = ?1 AND lower(username) = ?2",
            params![platform, username],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Không thể tra hồ sơ của repertoire.".to_string())
}
