use crate::*;

pub(crate) fn read_cached_explanation(
    database: &tauri::State<'_, DatabaseState>,
    cache_key: &str,
) -> Result<Option<String>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể đọc bộ nhớ lời giải thích.".to_string())?;
    connection
        .query_row(
            "SELECT explanation FROM ai_explanations WHERE cache_key = ?1",
            params![cache_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Không thể đọc lời giải thích đã lưu.".to_string())
}

pub(crate) fn write_cached_explanation(
    database: &tauri::State<'_, DatabaseState>,
    expected_generation: u64,
    cache_key: &str,
    provider: &str,
    model: &str,
    prompt_version: &str,
    text: &str,
) -> Result<(), String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể ghi bộ nhớ lời giải thích.".to_string())?;
    if connection.generation != expected_generation {
        return Ok(());
    }
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu lưu lời giải thích.".to_string())?;
    transaction
        .execute(
            "INSERT OR REPLACE INTO ai_explanations
             (cache_key, provider, model, prompt_version, explanation, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![cache_key, provider, model, prompt_version, text],
        )
        .map_err(|_| "Không thể lưu lời giải thích xuống máy.".to_string())?;
    queue_cloud_change(&transaction, "ai_explanation", cache_key, "upsert")
        .map_err(|_| "Không thể xếp lời giải thích vào hàng đợi cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu lời giải thích.".to_string())
}

pub(crate) fn clear_ai_cache(database: tauri::State<'_, DatabaseState>) -> Result<u64, String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở bộ nhớ lời giải thích.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu xoá dữ liệu AI.".to_string())?;
    let cache_keys = {
        let mut statement = transaction
            .prepare("SELECT cache_key FROM ai_explanations")
            .map_err(|_| "Không thể chuẩn bị danh sách cache AI.".to_string())?;
        let values = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|_| "Không thể đọc danh sách cache AI.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Danh sách cache AI không hợp lệ.".to_string())?;
        values
    };
    for cache_key in &cache_keys {
        queue_cloud_change(&transaction, "ai_explanation", cache_key, "delete")
            .map_err(|_| "Không thể xếp thao tác xoá cache AI.".to_string())?;
    }
    transaction
        .execute("DELETE FROM ai_explanations", [])
        .map_err(|_| "Không thể xoá dữ liệu AI đã lưu.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất xoá dữ liệu AI.".to_string())?;
    Ok(cache_keys.len() as u64)
}
