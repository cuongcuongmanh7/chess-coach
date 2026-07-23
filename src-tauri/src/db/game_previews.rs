use crate::*;

pub(crate) fn save_game_previews(
    database: tauri::State<'_, DatabaseState>,
    updates: Vec<GamePreviewUpdate>,
) -> Result<(), String> {
    if updates.len() > 500 {
        return Err("Có quá nhiều thumbnail cần cập nhật cùng lúc.".to_string());
    }
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu cập nhật thumbnail.".to_string())?;
    for update in updates {
        if update.id.len() != 64
            || !update
                .id
                .chars()
                .all(|character| character.is_ascii_hexdigit())
            || update.final_fen.len() > 120
            || update.final_fen.split_whitespace().count() != 6
            || update.ply_count <= 0
        {
            return Err("Dữ liệu thumbnail bàn cờ không hợp lệ.".to_string());
        }
        transaction
            .execute(
                "UPDATE saved_games SET final_fen = ?1, ply_count = ?2 WHERE id = ?3",
                params![update.final_fen, update.ply_count, update.id],
            )
            .map_err(|_| "Không thể lưu thumbnail bàn cờ.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất cập nhật thumbnail.".to_string())
}
