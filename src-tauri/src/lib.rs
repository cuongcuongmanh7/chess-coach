use reqwest::{Client, Url};
use serde_json::Value;
use std::time::Duration;

fn text_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

#[tauri::command]
async fn fetch_chess_com_game(game_url: String) -> Result<String, String> {
    let parsed = Url::parse(game_url.trim()).map_err(|_| "Link không hợp lệ.".to_string())?;
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    if host != "chess.com" && host != "www.chess.com" {
        return Err("App chỉ nhận link thuộc chess.com.".to_string());
    }

    let segments: Vec<&str> = parsed
        .path_segments()
        .map(|parts| parts.collect())
        .unwrap_or_default();
    if segments.len() < 3 || segments[0] != "game" {
        return Err("Hãy dùng link có dạng chess.com/game/live/…".to_string());
    }

    let game_kind = segments[1];
    if game_kind != "live" && game_kind != "daily" {
        return Err("Prototype hiện hỗ trợ link game/live và game/daily.".to_string());
    }
    let game_id = segments[2]
        .split('?')
        .next()
        .unwrap_or_default()
        .trim();
    if game_id.is_empty() || !game_id.chars().all(|character| character.is_ascii_digit()) {
        return Err("Không tìm thấy mã ván đấu trong link.".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("KyPho-ChessCoachVN/0.1 (local desktop prototype)")
        .build()
        .map_err(|_| "Không thể khởi tạo kết nối mạng.".to_string())?;

    let callback_url = format!("https://www.chess.com/callback/{game_kind}/game/{game_id}");
    let callback_response = client
        .get(callback_url)
        .send()
        .await
        .map_err(|_| "Không kết nối được với Chess.com.".to_string())?;
    if !callback_response.status().is_success() {
        return Err("Chess.com không trả về thông tin ván này. Hãy thử dán PGN.".to_string());
    }

    let callback: Value = callback_response
        .json()
        .await
        .map_err(|_| "Dữ liệu ván đấu từ Chess.com không đúng định dạng.".to_string())?;
    let game = callback.get("game").unwrap_or(&callback);
    if !game.get("isFinished").and_then(Value::as_bool).unwrap_or(false) {
        return Err("Ván đấu chưa kết thúc nên chưa có PGN công khai.".to_string());
    }
    let headers = game
        .get("pgnHeaders")
        .ok_or_else(|| "Không đọc được thông tin PGN của ván.".to_string())?;
    let player = text_field(headers, "White")
        .or_else(|| text_field(headers, "Black"))
        .ok_or_else(|| "Không tìm thấy tên người chơi.".to_string())?;
    let date = text_field(headers, "Date")
        .ok_or_else(|| "Không tìm thấy ngày diễn ra ván đấu.".to_string())?;
    let date_parts: Vec<&str> = date.split('.').collect();
    if date_parts.len() < 2 {
        return Err("Ngày thi đấu không đúng định dạng.".to_string());
    }

    let archive_url = format!(
        "https://api.chess.com/pub/player/{}/games/{}/{}",
        player.to_ascii_lowercase(),
        date_parts[0],
        date_parts[1]
    );
    let archive_response = client
        .get(archive_url)
        .send()
        .await
        .map_err(|_| "Không tải được kho ván đấu công khai.".to_string())?;
    if !archive_response.status().is_success() {
        return Err("Kho ván đấu Chess.com chưa công khai ván này. Hãy dán PGN.".to_string());
    }
    let archive: Value = archive_response
        .json()
        .await
        .map_err(|_| "Kho ván đấu trả về dữ liệu không đúng định dạng.".to_string())?;

    let games = archive
        .get("games")
        .and_then(Value::as_array)
        .ok_or_else(|| "Không tìm thấy danh sách ván trong tháng.".to_string())?;

    for archived_game in games {
        let url_matches = text_field(archived_game, "url")
            .map(|url| url.trim_end_matches('/').ends_with(game_id))
            .unwrap_or(false);
        let pgn = text_field(archived_game, "pgn");
        let pgn_matches = pgn
            .map(|text| text.contains(&format!("/{game_id}\"]")))
            .unwrap_or(false);
        if url_matches || pgn_matches {
            return pgn
                .map(str::to_owned)
                .ok_or_else(|| "Ván được tìm thấy nhưng chưa có PGN.".to_string());
        }
    }

    Err("Không tìm thấy ván trong dữ liệu công khai. Hãy dán PGN để phân tích ngay.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_chess_com_game])
        .run(tauri::generate_context!())
        .expect("không thể khởi chạy ứng dụng Kỳ Phổ");
}
