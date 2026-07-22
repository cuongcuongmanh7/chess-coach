use reqwest::{Client, Url};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Mutex;
use std::time::Duration;

#[derive(Default)]
struct OpenAiState(Mutex<Option<String>>);

#[derive(Deserialize)]
struct ExplainMoveRequest {
    player_elo: Option<String>,
    phase: String,
    move_number: u32,
    played_move: String,
    fen_before: String,
    fen_after: String,
    evaluation: String,
    centipawn_loss: i32,
    best_move: String,
    best_line: Vec<String>,
}

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

fn openai_key(state: &tauri::State<'_, OpenAiState>) -> Result<String, String> {
    if let Ok(value) = std::env::var("OPENAI_API_KEY") {
        if !value.trim().is_empty() {
            return Ok(value);
        }
    }
    state
        .0
        .lock()
        .map_err(|_| "Không đọc được trạng thái API key.".to_string())?
        .clone()
        .ok_or_else(|| "Chưa cấu hình OpenAI API key.".to_string())
}

#[tauri::command]
fn set_openai_api_key(
    state: tauri::State<'_, OpenAiState>,
    api_key: String,
) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.len() < 20 || trimmed.chars().any(char::is_whitespace) {
        return Err("API key không đúng định dạng.".to_string());
    }
    *state
        .0
        .lock()
        .map_err(|_| "Không thể lưu API key trong phiên này.".to_string())? =
        Some(trimmed.to_string());
    Ok(())
}

#[tauri::command]
fn clear_openai_api_key(state: tauri::State<'_, OpenAiState>) -> Result<(), String> {
    *state
        .0
        .lock()
        .map_err(|_| "Không thể xoá API key khỏi phiên này.".to_string())? = None;
    Ok(())
}

#[tauri::command]
fn has_openai_api_key(state: tauri::State<'_, OpenAiState>) -> bool {
    std::env::var("OPENAI_API_KEY")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
        || state
            .0
            .lock()
            .map(|value| value.is_some())
            .unwrap_or(false)
}

fn extract_output_text(response: &Value) -> Option<String> {
    if let Some(text) = response.get("output_text").and_then(Value::as_str) {
        return Some(text.to_string());
    }

    for item in response.get("output")?.as_array()? {
        let Some(content) = item.get("content").and_then(Value::as_array) else {
            continue;
        };
        for part in content {
            if part.get("type").and_then(Value::as_str) == Some("output_text") {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    return Some(text.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
async fn explain_move(
    state: tauri::State<'_, OpenAiState>,
    request: ExplainMoveRequest,
    model: String,
) -> Result<String, String> {
    let allowed_models = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
    if !allowed_models.contains(&model.as_str()) {
        return Err("Model OpenAI chưa được hỗ trợ trong app.".to_string());
    }
    let api_key = openai_key(&state)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|_| "Không thể khởi tạo kết nối OpenAI.".to_string())?;

    let input = serde_json::json!({
        "trinh_do_nguoi_choi": request.player_elo.unwrap_or_else(|| "không rõ".to_string()),
        "giai_doan": request.phase,
        "so_nuoc": request.move_number,
        "nuoc_da_di": request.played_move,
        "fen_truoc": request.fen_before,
        "fen_sau": request.fen_after,
        "danh_gia_sau_nuoc": request.evaluation,
        "centipawn_loss": request.centipawn_loss,
        "nuoc_tot_nhat": request.best_move,
        "bien_chinh": request.best_line,
    });

    let payload = serde_json::json!({
        "model": model,
        "store": false,
        "reasoning": { "effort": "low" },
        "text": { "verbosity": "low" },
        "instructions": "Bạn là huấn luyện viên cờ vua nói tiếng Việt cho người chơi khoảng 1000–1500 Elo. Dữ liệu Stockfish là nguồn sự thật. Giải thích vì sao nước đã đi tốt hoặc sai, nêu ý tưởng của nước tốt nhất và cho đúng một lời khuyên có thể áp dụng. Viết 2 đoạn ngắn, thân thiện, cụ thể, không dùng Markdown, không nhắc lại FEN và không bịa thêm variation.",
        "input": input.to_string()
    });

    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|_| "Không kết nối được với OpenAI API.".to_string())?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|_| "OpenAI trả về dữ liệu không đọc được.".to_string())?;

    if !status.is_success() {
        let message = body
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Yêu cầu OpenAI không thành công.");
        return Err(format!("OpenAI API: {message}"));
    }

    extract_output_text(&body)
        .ok_or_else(|| "OpenAI không trả về phần giải thích.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenAiState::default())
        .invoke_handler(tauri::generate_handler![
            fetch_chess_com_game,
            set_openai_api_key,
            clear_openai_api_key,
            has_openai_api_key,
            explain_move
        ])
        .run(tauri::generate_context!())
        .expect("không thể khởi chạy ứng dụng Kỳ Phổ");
}
