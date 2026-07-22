use reqwest::{Client, Url};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

#[derive(Default)]
struct ApiKeyState {
    openai: Mutex<Option<String>>,
    gemini: Mutex<Option<String>>,
}

struct DatabaseState(Mutex<Connection>);

#[derive(Clone, Deserialize, Serialize)]
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

#[derive(Serialize)]
struct AiExplanation {
    text: String,
    provider: String,
    model: String,
    cached: bool,
}

const COACH_PROMPT: &str = "Bạn là huấn luyện viên cờ vua nói tiếng Việt cho người chơi khoảng 1000–1500 Elo. Dữ liệu Stockfish là nguồn sự thật. Giải thích vì sao nước đã đi tốt hoặc sai, nêu ý tưởng của nước tốt nhất và cho đúng một lời khuyên có thể áp dụng. Viết 2 đoạn ngắn, thân thiện, cụ thể, không dùng Markdown, không nhắc lại FEN và không bịa thêm variation.";
const PROMPT_VERSION: &str = "coach-v2";

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
    let game_id = segments[2].split('?').next().unwrap_or_default().trim();
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
    if !game
        .get("isFinished")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
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

fn normalized_provider(provider: &str) -> Result<&str, String> {
    match provider {
        "openai" | "gemini" => Ok(provider),
        _ => Err("Nhà cung cấp AI chưa được hỗ trợ.".to_string()),
    }
}

fn environment_key(provider: &str) -> Option<String> {
    let names: &[&str] = if provider == "gemini" {
        &["GEMINI_API_KEY", "GOOGLE_API_KEY"]
    } else {
        &["OPENAI_API_KEY"]
    };
    names.iter().find_map(|name| {
        std::env::var(name)
            .ok()
            .filter(|value| !value.trim().is_empty())
    })
}

fn api_key(state: &tauri::State<'_, ApiKeyState>, provider: &str) -> Result<String, String> {
    let provider = normalized_provider(provider)?;
    if let Some(value) = environment_key(provider) {
        return Ok(value);
    }
    let key = if provider == "gemini" {
        &state.gemini
    } else {
        &state.openai
    };
    key.lock()
        .map_err(|_| "Không đọc được trạng thái API key.".to_string())?
        .clone()
        .ok_or_else(|| format!("Chưa cấu hình {} API key.", provider_label(provider)))
}

fn provider_label(provider: &str) -> &str {
    if provider == "gemini" {
        "Gemini"
    } else {
        "OpenAI"
    }
}

#[tauri::command]
fn set_api_key(
    state: tauri::State<'_, ApiKeyState>,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    let provider = normalized_provider(&provider)?;
    let trimmed = api_key.trim();
    if trimmed.len() < 20 || trimmed.chars().any(char::is_whitespace) {
        return Err("API key không đúng định dạng.".to_string());
    }
    let target = if provider == "gemini" {
        &state.gemini
    } else {
        &state.openai
    };
    *target
        .lock()
        .map_err(|_| "Không thể lưu API key trong phiên này.".to_string())? =
        Some(trimmed.to_string());
    Ok(())
}

#[tauri::command]
fn clear_api_key(state: tauri::State<'_, ApiKeyState>, provider: String) -> Result<(), String> {
    let provider = normalized_provider(&provider)?;
    let target = if provider == "gemini" {
        &state.gemini
    } else {
        &state.openai
    };
    *target
        .lock()
        .map_err(|_| "Không thể xoá API key khỏi phiên này.".to_string())? = None;
    Ok(())
}

#[tauri::command]
fn has_api_key(state: tauri::State<'_, ApiKeyState>, provider: String) -> bool {
    if normalized_provider(&provider).is_err() {
        return false;
    }
    if environment_key(&provider).is_some() {
        return true;
    }
    let target = if provider == "gemini" {
        &state.gemini
    } else {
        &state.openai
    };
    target.lock().map(|value| value.is_some()).unwrap_or(false)
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

fn extract_gemini_text(response: &Value) -> Option<String> {
    let parts = response
        .pointer("/candidates/0/content/parts")?
        .as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    (!text.trim().is_empty()).then(|| text.trim().to_string())
}

fn validate_model(provider: &str, model: &str) -> Result<(), String> {
    let allowed = if provider == "gemini" {
        ["gemini-3.5-flash-lite", "gemini-3.6-flash"].as_slice()
    } else {
        ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"].as_slice()
    };
    if allowed.contains(&model) {
        Ok(())
    } else {
        Err(format!(
            "Model {} chưa được hỗ trợ trong app.",
            provider_label(provider)
        ))
    }
}

fn explanation_cache_key(provider: &str, model: &str, request: &ExplainMoveRequest) -> String {
    let mut hasher = Sha256::new();
    hasher.update(PROMPT_VERSION.as_bytes());
    hasher.update(provider.as_bytes());
    hasher.update(model.as_bytes());
    hasher.update(serde_json::to_vec(request).unwrap_or_default());
    format!("{:x}", hasher.finalize())
}

fn read_cached_explanation(
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

fn write_cached_explanation(
    database: &tauri::State<'_, DatabaseState>,
    cache_key: &str,
    provider: &str,
    model: &str,
    text: &str,
) -> Result<(), String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể ghi bộ nhớ lời giải thích.".to_string())?;
    connection
        .execute(
            "INSERT OR REPLACE INTO ai_explanations
             (cache_key, provider, model, prompt_version, explanation, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            params![cache_key, provider, model, PROMPT_VERSION, text],
        )
        .map(|_| ())
        .map_err(|_| "Không thể lưu lời giải thích xuống máy.".to_string())
}

#[tauri::command]
fn get_cached_explanation(
    database: tauri::State<'_, DatabaseState>,
    request: ExplainMoveRequest,
    provider: String,
    model: String,
) -> Result<Option<AiExplanation>, String> {
    let provider = normalized_provider(&provider)?;
    validate_model(provider, &model)?;
    let cache_key = explanation_cache_key(provider, &model, &request);
    Ok(
        read_cached_explanation(&database, &cache_key)?.map(|text| AiExplanation {
            text,
            provider: provider.to_string(),
            model,
            cached: true,
        }),
    )
}

#[tauri::command]
fn clear_ai_cache(database: tauri::State<'_, DatabaseState>) -> Result<u64, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở bộ nhớ lời giải thích.".to_string())?;
    connection
        .execute("DELETE FROM ai_explanations", [])
        .map(|count| count as u64)
        .map_err(|_| "Không thể xoá dữ liệu AI đã lưu.".to_string())
}

fn move_input(request: &ExplainMoveRequest) -> Value {
    serde_json::json!({
        "trinh_do_nguoi_choi": request.player_elo.as_deref().unwrap_or("không rõ"),
        "giai_doan": request.phase,
        "so_nuoc": request.move_number,
        "nuoc_da_di": request.played_move,
        "fen_truoc": request.fen_before,
        "fen_sau": request.fen_after,
        "danh_gia_sau_nuoc": request.evaluation,
        "centipawn_loss": request.centipawn_loss,
        "nuoc_tot_nhat": request.best_move,
        "bien_chinh": request.best_line,
    })
}

async fn request_openai(
    client: &Client,
    key: &str,
    model: &str,
    input: &Value,
) -> Result<String, String> {
    let payload = serde_json::json!({
        "model": model,
        "store": false,
        "reasoning": { "effort": "low" },
        "text": { "verbosity": "low" },
        "instructions": COACH_PROMPT,
        "input": input.to_string()
    });
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(key)
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
    extract_output_text(&body).ok_or_else(|| "OpenAI không trả về phần giải thích.".to_string())
}

async fn request_gemini(
    client: &Client,
    key: &str,
    model: &str,
    input: &Value,
) -> Result<String, String> {
    let payload = serde_json::json!({
        "systemInstruction": { "parts": [{ "text": COACH_PROMPT }] },
        "contents": [{ "role": "user", "parts": [{ "text": input.to_string() }] }],
        "generationConfig": { "maxOutputTokens": 500 }
    });
    let url =
        format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let response = client
        .post(url)
        .header("x-goog-api-key", key)
        .json(&payload)
        .send()
        .await
        .map_err(|_| "Không kết nối được với Gemini API.".to_string())?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|_| "Gemini trả về dữ liệu không đọc được.".to_string())?;
    if !status.is_success() {
        let message = body
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Yêu cầu Gemini không thành công.");
        return Err(format!("Gemini API: {message}"));
    }
    extract_gemini_text(&body).ok_or_else(|| "Gemini không trả về phần giải thích.".to_string())
}

#[tauri::command]
async fn explain_move(
    state: tauri::State<'_, ApiKeyState>,
    database: tauri::State<'_, DatabaseState>,
    request: ExplainMoveRequest,
    provider: String,
    model: String,
    force_refresh: bool,
) -> Result<AiExplanation, String> {
    let provider = normalized_provider(&provider)?;
    validate_model(provider, &model)?;
    let cache_key = explanation_cache_key(provider, &model, &request);
    if !force_refresh {
        if let Some(text) = read_cached_explanation(&database, &cache_key)? {
            return Ok(AiExplanation {
                text,
                provider: provider.to_string(),
                model,
                cached: true,
            });
        }
    }

    let key = api_key(&state, provider)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|_| "Không thể khởi tạo kết nối AI.".to_string())?;
    let input = move_input(&request);
    let text = if provider == "gemini" {
        request_gemini(&client, &key, &model, &input).await?
    } else {
        request_openai(&client, &key, &model, &input).await?
    };
    write_cached_explanation(&database, &cache_key, provider, &model, &text)?;
    Ok(AiExplanation {
        text,
        provider: provider.to_string(),
        model,
        cached: false,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ApiKeyState::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let connection = Connection::open(data_dir.join("ky-pho.sqlite3"))?;
            connection.execute_batch(
                "CREATE TABLE IF NOT EXISTS ai_explanations (
                    cache_key TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    explanation TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ai_explanations_provider_model
                ON ai_explanations(provider, model);",
            )?;
            app.manage(DatabaseState(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_chess_com_game,
            set_api_key,
            clear_api_key,
            has_api_key,
            get_cached_explanation,
            clear_ai_cache,
            explain_move
        ])
        .run(tauri::generate_context!())
        .expect("không thể khởi chạy ứng dụng Kỳ Phổ");
}
