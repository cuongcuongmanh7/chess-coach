use crate::*;

#[tauri::command]
pub(crate) async fn fetch_chess_com_game(game_url: String) -> Result<String, String> {
    crate::fetch_chess_com_game(game_url).await
}

#[tauri::command]
pub(crate) async fn fetch_recent_games(
    request: FetchRecentGamesRequest,
) -> Result<Vec<String>, String> {
    crate::fetch_recent_games(request).await
}

#[tauri::command]
pub(crate) async fn begin_google_oauth() -> Result<String, String> {
    crate::begin_google_oauth().await
}

#[tauri::command]
pub(crate) fn cancel_google_oauth() {
    crate::cancel_google_oauth();
}
