use crate::*;

#[tauri::command]
pub(crate) fn save_game(
    database: tauri::State<'_, DatabaseState>,
    request: SaveGameRequest,
) -> Result<String, String> {
    crate::save_game(database, request)
}

#[tauri::command]
pub(crate) fn list_saved_games(
    database: tauri::State<'_, DatabaseState>,
    profile_id: Option<i64>,
) -> Result<Vec<SavedGameSummary>, String> {
    crate::list_saved_games(database, profile_id)
}

#[tauri::command]
pub(crate) fn open_saved_game(
    database: tauri::State<'_, DatabaseState>,
    id: String,
) -> Result<SavedGameDetail, String> {
    crate::open_saved_game(database, id)
}

#[tauri::command]
pub(crate) fn delete_saved_game(
    database: tauri::State<'_, DatabaseState>,
    id: String,
) -> Result<bool, String> {
    crate::delete_saved_game(database, id)
}

#[tauri::command]
pub(crate) fn save_engine_analysis(
    database: tauri::State<'_, DatabaseState>,
    request: SaveEngineAnalysisRequest,
) -> Result<(), String> {
    crate::save_engine_analysis(database, request)
}

#[tauri::command]
pub(crate) fn list_engine_analyses(
    database: tauri::State<'_, DatabaseState>,
    game_id: String,
) -> Result<Vec<StoredEngineAnalysis>, String> {
    crate::list_engine_analyses(database, game_id)
}

#[tauri::command]
pub(crate) fn mark_game_analysis_complete(
    database: tauri::State<'_, DatabaseState>,
    game_id: String,
) -> Result<(), String> {
    crate::mark_game_analysis_complete(database, game_id)
}

#[tauri::command]
pub(crate) fn get_dashboard_records(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<Vec<DashboardMoveRecord>, String> {
    crate::get_dashboard_records(database, profile_id)
}
