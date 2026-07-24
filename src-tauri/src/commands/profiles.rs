use crate::*;

#[tauri::command]
pub(crate) fn list_player_profiles(
    database: tauri::State<'_, DatabaseState>,
) -> Result<Vec<PlayerProfileSummary>, String> {
    crate::list_player_profiles(database)
}

#[tauri::command]
pub(crate) fn add_player_profile(
    database: tauri::State<'_, DatabaseState>,
    platform: String,
    username: String,
) -> Result<PlayerProfileSummary, String> {
    crate::add_player_profile(database, platform, username)
}

#[tauri::command]
pub(crate) fn delete_player_profile(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<(), String> {
    crate::delete_player_profile(database, profile_id)
}

#[tauri::command]
pub(crate) fn mark_profile_synced(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<(), String> {
    crate::mark_profile_synced(database, profile_id)
}

#[tauri::command]
pub(crate) fn set_profile_sync_state(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
    watermark: Option<String>,
    gap: bool,
) -> Result<(), String> {
    crate::set_profile_sync_state(database, profile_id, watermark, gap)
}
