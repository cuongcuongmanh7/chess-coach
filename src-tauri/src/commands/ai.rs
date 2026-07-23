use crate::*;

#[tauri::command]
pub(crate) fn set_api_key(
    state: tauri::State<'_, ApiKeyState>,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    crate::set_api_key(state, provider, api_key)
}

#[tauri::command]
pub(crate) fn clear_api_key(
    state: tauri::State<'_, ApiKeyState>,
    provider: String,
) -> Result<(), String> {
    crate::clear_api_key(state, provider)
}

#[tauri::command]
pub(crate) fn has_api_key(
    state: tauri::State<'_, ApiKeyState>,
    provider: String,
) -> bool {
    crate::has_api_key(state, provider)
}

#[tauri::command]
pub(crate) fn get_cached_explanation(
    database: tauri::State<'_, DatabaseState>,
    provider: String,
    model: String,
    request: ExplainMoveRequest,
) -> Result<Option<AiExplanation>, String> {
    crate::get_cached_explanation(database, request, provider, model)
}

#[tauri::command]
pub(crate) fn clear_ai_cache(
    database: tauri::State<'_, DatabaseState>,
) -> Result<u64, String> {
    crate::clear_ai_cache(database)
}

#[tauri::command]
pub(crate) async fn explain_move(
    database: tauri::State<'_, DatabaseState>,
    state: tauri::State<'_, ApiKeyState>,
    provider: String,
    model: String,
    request: ExplainMoveRequest,
    force_refresh: bool,
) -> Result<AiExplanation, String> {
    crate::explain_move(state, database, request, provider, model, force_refresh).await
}

#[tauri::command]
pub(crate) async fn summarize_game(
    database: tauri::State<'_, DatabaseState>,
    state: tauri::State<'_, ApiKeyState>,
    provider: String,
    model: String,
    request: ExplainGameRequest,
    force_refresh: bool,
) -> Result<AiExplanation, String> {
    crate::summarize_game(state, database, request, provider, model, force_refresh).await
}
