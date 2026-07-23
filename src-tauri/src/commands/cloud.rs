use crate::*;

#[tauri::command]
pub(crate) fn export_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
) -> Result<CloudSyncBatch, String> {
    crate::export_cloud_changes(database)
}

#[tauri::command]
pub(crate) fn merge_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
    request: MergeCloudChangesRequest,
) -> Result<CloudMergeResult, String> {
    crate::merge_cloud_changes(database, request)
}

#[tauri::command]
pub(crate) fn get_cloud_sync_cursors(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
) -> Result<CloudSyncCursors, String> {
    crate::get_cloud_sync_cursors(database, uid)
}

#[tauri::command]
pub(crate) fn set_cloud_sync_cursors(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
    cursors: CloudSyncCursors,
) -> Result<(), String> {
    crate::set_cloud_sync_cursors(database, uid, cursors)
}

#[tauri::command]
pub(crate) fn acknowledge_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
    tokens: Vec<CloudAckToken>,
) -> Result<usize, String> {
    crate::acknowledge_cloud_changes(database, tokens)
}

#[tauri::command]
pub(crate) fn mark_cloud_changes_failed(
    database: tauri::State<'_, DatabaseState>,
    tokens: Vec<CloudAckToken>,
    error: String,
) -> Result<(), String> {
    crate::mark_cloud_changes_failed(database, tokens, error)
}

#[tauri::command]
pub(crate) fn activate_cloud_account(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
) -> Result<DatabaseActivationResult, String> {
    crate::activate_cloud_account(database, uid)
}

#[tauri::command]
pub(crate) fn deactivate_cloud_account(
    database: tauri::State<'_, DatabaseState>,
) -> Result<DatabaseActivationResult, String> {
    crate::deactivate_cloud_account(database)
}
