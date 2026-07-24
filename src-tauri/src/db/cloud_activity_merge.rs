use crate::*;
use rusqlite::Transaction;

fn valid_hex_id(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn valid_training_attempt(data: &CloudTrainingAttempt, document_id: &str) -> bool {
    let valid_profile_key = data
        .profile_key
        .split_once(':')
        .is_some_and(|(platform, username)| {
            normalized_platform(Some(platform)).is_some()
                && valid_username(username)
                && data.profile_key == format!("{platform}:{}", username.to_ascii_lowercase())
        });
    valid_hex_id(document_id)
        && data.cloud_id == document_id
        && validate_game_id(&data.game_id).is_ok()
        && valid_profile_key
        && data.ply > 0
        && data.ply <= 2_000
        && data.card_id == training_card_id(&data.profile_key, &data.game_id, data.ply)
        && data.engine_version == ENGINE_VERSION
        && matches!(
            data.result.as_str(),
            "wrong" | "revealed" | "assisted" | "slow" | "clean"
        )
        && data
            .attempted_move
            .as_ref()
            .is_none_or(|value| value.len() <= 32)
        && data.centipawn_loss.is_none_or(f64::is_finite)
        && data.hints_used <= 3
        && data.failed_attempts <= 100
        && data.duration_ms.is_none_or(|value| value <= 86_400_000)
        && data.attempted_at.len() <= 64
}

fn reconcile_training_card(transaction: &Transaction<'_>, card_id: &str) -> rusqlite::Result<()> {
    transaction.execute(
        "UPDATE training_cards SET
           attempts = MAX(attempts, (
             SELECT COUNT(*) FROM training_attempts WHERE card_id = ?1
           )),
           lapses = MAX(lapses, (
             SELECT COUNT(*) FROM training_attempts
             WHERE card_id = ?1 AND result IN ('wrong', 'revealed')
           )),
           last_correct_at = COALESCE((
             SELECT MAX(attempted_at) FROM training_attempts
             WHERE card_id = ?1 AND result IN ('clean', 'slow', 'assisted')
           ), last_correct_at)
         WHERE id = ?1",
        params![card_id],
    )?;
    Ok(())
}

pub(crate) fn merge_training_attempts(
    transaction: &Transaction<'_>,
    changes: &[CloudRemoteTrainingAttemptChange],
) -> Result<usize, String> {
    let mut merged = 0;
    for change in changes {
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'training_attempt' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận lần luyện đã xoá.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM training_attempts WHERE cloud_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá lần luyện cloud.".to_string())?;
            continue;
        }
        let data = change
            .data
            .as_ref()
            .ok_or_else(|| "Lần luyện cloud bị thiếu dữ liệu.".to_string())?;
        if !valid_training_attempt(data, &change.document_id) {
            return Err("Dữ liệu lần luyện cloud không hợp lệ.".to_string());
        }
        if pending_cloud_operation(transaction, "training_attempt", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột lần luyện.".to_string())?
            .is_some()
        {
            continue;
        }
        let game_exists = transaction
            .query_row(
                "SELECT 1 FROM saved_games WHERE id = ?1",
                params![&data.game_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|_| "Không thể kiểm tra ván của lần luyện.".to_string())?
            .is_some();
        if !game_exists {
            continue;
        }
        merged += transaction
            .execute(
                "INSERT OR IGNORE INTO training_attempts
                 (cloud_id, card_id, attempted_move, result, centipawn_loss, hints_used,
                  failed_attempts, duration_ms, attempted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    &data.cloud_id,
                    &data.card_id,
                    &data.attempted_move,
                    &data.result,
                    data.centipawn_loss,
                    data.hints_used,
                    data.failed_attempts,
                    data.duration_ms,
                    &data.attempted_at,
                ],
            )
            .map_err(|_| "Không thể nhập lần luyện từ cloud.".to_string())?;
        reconcile_training_card(transaction, &data.card_id)
            .map_err(|_| "Không thể hợp nhất thống kê luyện.".to_string())?;
    }
    Ok(merged)
}

pub(crate) fn merge_ai_explanations(
    transaction: &Transaction<'_>,
    changes: &[CloudRemoteAiExplanationChange],
) -> Result<usize, String> {
    let mut merged = 0;
    for change in changes {
        if !valid_hex_id(&change.document_id) {
            return Err("Mã cache HLV AI không hợp lệ.".to_string());
        }
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'ai_explanation' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận cache HLV AI đã xoá.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM ai_explanations WHERE cache_key = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá cache HLV AI.".to_string())?;
            continue;
        }
        let data = change
            .data
            .as_ref()
            .ok_or_else(|| "Cache HLV AI bị thiếu dữ liệu.".to_string())?;
        if data.cache_key != change.document_id
            || !matches!(data.provider.as_str(), "openai" | "gemini")
            || data.model.is_empty()
            || data.model.len() > 100
            || data.prompt_version.is_empty()
            || data.prompt_version.len() > 100
            || data.explanation.is_empty()
            || data.explanation.len() > 200_000
            || data.created_at.len() > 64
        {
            return Err("Dữ liệu cache HLV AI không hợp lệ.".to_string());
        }
        if pending_cloud_operation(transaction, "ai_explanation", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột cache HLV AI.".to_string())?
            .is_some()
        {
            continue;
        }
        merged += transaction
            .execute(
                "INSERT OR IGNORE INTO ai_explanations
                 (cache_key, provider, model, prompt_version, explanation, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &data.cache_key,
                    &data.provider,
                    &data.model,
                    &data.prompt_version,
                    &data.explanation,
                    &data.created_at,
                ],
            )
            .map_err(|_| "Không thể nhập cache HLV AI.".to_string())?;
    }
    Ok(merged)
}
