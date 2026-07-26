use crate::*;

#[tauri::command]
pub(crate) fn save_repertoire(
    database: tauri::State<'_, DatabaseState>,
    request: SaveRepertoireRequest,
) -> Result<SaveRepertoireResult, String> {
    crate::save_repertoire(database, request)
}

#[tauri::command]
pub(crate) fn list_repertoires(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<Vec<Repertoire>, String> {
    crate::list_repertoires(database, profile_id)
}

#[tauri::command]
pub(crate) fn get_repertoire_tree(
    database: tauri::State<'_, DatabaseState>,
    repertoire_id: String,
) -> Result<Vec<RepertoireNode>, String> {
    crate::get_repertoire_tree(database, repertoire_id)
}

#[tauri::command]
pub(crate) fn next_repertoire_nodes(
    database: tauri::State<'_, DatabaseState>,
    repertoire_id: String,
) -> Result<Vec<RepertoireNode>, String> {
    crate::next_repertoire_nodes(database, repertoire_id)
}

#[tauri::command]
pub(crate) fn review_repertoire_node(
    database: tauri::State<'_, DatabaseState>,
    request: ReviewRepertoireNodeRequest,
) -> Result<RepertoireProgress, String> {
    crate::review_repertoire_node(database, request)
}

#[tauri::command]
pub(crate) fn add_repertoire_move(
    database: tauri::State<'_, DatabaseState>,
    request: AddRepertoireMoveRequest,
) -> Result<RepertoireNode, String> {
    crate::add_repertoire_move(database, request)
}
