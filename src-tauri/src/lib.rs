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
    side_just_moved: String,
    side_to_move: String,
    phase: String,
    move_number: u32,
    played_move: String,
    fen_before: String,
    fen_after: String,
    evaluation: String,
    centipawn_loss: i32,
    best_move: String,
    best_line: Vec<String>,
    best_reply: Option<String>,
    reply_line: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
struct SummaryQualityCounts {
    best: u32,
    good: u32,
    inaccuracy: u32,
    mistake: u32,
    blunder: u32,
}

#[derive(Clone, Deserialize, Serialize)]
struct GamePlayerSummary {
    name: String,
    elo: Option<String>,
    moves: u32,
    acpl: i32,
    best_good_rate: i32,
    counts: SummaryQualityCounts,
}

#[derive(Clone, Deserialize, Serialize)]
struct CriticalPositionSummary {
    move_number: u32,
    side: String,
    played_move: String,
    quality: String,
    centipawn_loss: i32,
    evaluation: String,
    best_move: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct ExplainGameRequest {
    opening: String,
    result: String,
    total_plies: u32,
    white: GamePlayerSummary,
    black: GamePlayerSummary,
    critical_positions: Vec<CriticalPositionSummary>,
}

#[derive(Serialize)]
struct AiExplanation {
    text: String,
    provider: String,
    model: String,
    cached: bool,
}

#[derive(Deserialize)]
struct SaveGameRequest {
    pgn: String,
    white: String,
    black: String,
    white_elo: Option<String>,
    black_elo: Option<String>,
    result: Option<String>,
    event: Option<String>,
    date: Option<String>,
    eco: Option<String>,
    time_control: Option<String>,
    source_url: Option<String>,
}

#[derive(Serialize)]
struct SavedGameSummary {
    id: String,
    white: String,
    black: String,
    white_elo: Option<String>,
    black_elo: Option<String>,
    result: Option<String>,
    event: Option<String>,
    date: Option<String>,
    eco: Option<String>,
    time_control: Option<String>,
    source_url: Option<String>,
    created_at: String,
    last_opened_at: String,
}

#[derive(Serialize)]
struct SavedGameDetail {
    id: String,
    pgn: String,
}

const COACH_PROMPT: &str = "Bạn là huấn luyện viên cờ vua nói tiếng Việt. Luôn viết tiếng Việt có dấu đầy đủ bằng Unicode; không được bỏ dấu ở bất kỳ từ tiếng Việt nào. Dữ liệu Stockfish và các trường màu quân là nguồn sự thật. Viết tổng cộng 70–90 từ trên đúng bốn dòng theo mẫu: 'ĐÁNH GIÁ: ...', 'Ý TƯỞNG: ...', 'SO SÁNH: ...', 'KẾ HOẠCH: ...'. Dòng ĐÁNH GIÁ kết luận thẳng về nước của ben_vua_di. Dòng Ý TƯỞNG giải thích lý do cụ thể. Dòng SO SÁNH đối chiếu ngắn với nuoc_tot_nhat. Dòng KẾ HOẠCH chỉ khuyên ben_toi_luot chơi nuoc_dap_tot_nhat sau vị trí thực tế; nếu không có nước đáp thì nói ván đã kết thúc. Khi nhắc quân đang tấn công, phòng thủ hoặc bị hạn chế, phải gọi đúng màu Trắng hoặc Đen theo ben_vua_di và ben_toi_luot; tuyệt đối không tự đảo màu quân. Bắt đầu ngay bằng nhãn, không chào hỏi, không câu chúc, không khen xã giao và không dùng lời dẫn. Giữ nguyên mọi ký hiệu nước cờ theo SAN như Bf4, e3, dxc4 hoặc O-O; không dịch hay đọc chúng thành chữ. Mọi điểm đánh giá phải giữ dạng có dấu và chữ số thập phân giống dữ liệu đầu vào, ví dụ +0.38 hoặc -1.25; tuyệt đối không viết số hay dấu thành chữ. Dùng Elo chỉ để điều chỉnh độ khó, không nhắc Elo trong câu trả lời. Không đưa lời khuyên chung chung; phải nêu quân, ô hoặc kế hoạch cụ thể. Không dùng Markdown, không nhắc lại FEN và không bịa thêm biến ngoài dữ liệu được cung cấp.";
const PROMPT_VERSION: &str = "coach-v6";
const GAME_SUMMARY_PROMPT: &str = "Bạn là huấn luyện viên cờ vua nói tiếng Việt. Hãy đưa ra nhận xét sơ bộ về toàn ván chỉ từ thống kê Stockfish và các vị trí then chốt được cung cấp. Luôn viết tiếng Việt có dấu đầy đủ bằng Unicode. Viết 150–220 từ trên đúng bảy dòng theo mẫu: 'TỔNG QUAN: ...', 'TRẮNG · ĐIỂM MẠNH: ...', 'TRẮNG · CẦN CẢI THIỆN: ...', 'TRẮNG · ƯU TIÊN: ...', 'ĐEN · ĐIỂM MẠNH: ...', 'ĐEN · CẦN CẢI THIỆN: ...', 'ĐEN · ƯU TIÊN: ...'. So sánh hai bên bằng ACPL, tỷ lệ Best/Tốt và số lỗi; chỉ nhắc nước cờ có trong critical_positions. Mỗi mục ưu tiên phải là đúng một chủ đề luyện tập cụ thể. Đây là đánh giá sơ bộ, không khẳng định phong cách hay tâm lý người chơi. Không chào hỏi, không câu chúc, không Markdown, không bịa chiến thuật, không nhắc FEN và không đọc ký hiệu nước cờ hay số thành chữ.";
const GAME_SUMMARY_PROMPT_VERSION: &str = "game-summary-v1";
const VIETNAMESE_DIACRITICS: &str = "ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵĂÂĐÊÔƠƯÁÀẢÃẠẤẦẨẪẬẮẰẲẴẶÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ";

fn has_vietnamese_diacritics(text: &str) -> bool {
    text.chars()
        .any(|character| VIETNAMESE_DIACRITICS.contains(character))
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
    let game_id = segments[2].split('?').next().unwrap_or_default().trim();
    if game_id.is_empty() || !game_id.chars().all(|character| character.is_ascii_digit()) {
        return Err("Không tìm thấy mã ván đấu trong link.".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("ChessCoachVN/0.4 (local desktop app)")
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

#[tauri::command]
fn save_game(
    database: tauri::State<'_, DatabaseState>,
    request: SaveGameRequest,
) -> Result<String, String> {
    let normalized_pgn = request.pgn.trim().replace("\r\n", "\n");
    if normalized_pgn.is_empty() {
        return Err("Không thể lưu ván cờ trống.".to_string());
    }
    let mut hasher = Sha256::new();
    hasher.update(normalized_pgn.as_bytes());
    let id = format!("{:x}", hasher.finalize());
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    connection
        .execute(
            "INSERT INTO saved_games
             (id, pgn, white, black, white_elo, black_elo, result, event, game_date, eco,
              time_control, source_url, created_at, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               pgn = excluded.pgn,
               white = excluded.white,
               black = excluded.black,
               white_elo = excluded.white_elo,
               black_elo = excluded.black_elo,
               result = excluded.result,
               event = excluded.event,
               game_date = excluded.game_date,
               eco = excluded.eco,
               time_control = excluded.time_control,
               source_url = COALESCE(excluded.source_url, saved_games.source_url),
               last_opened_at = datetime('now')",
            params![
                &id,
                &normalized_pgn,
                &request.white,
                &request.black,
                &request.white_elo,
                &request.black_elo,
                &request.result,
                &request.event,
                &request.date,
                &request.eco,
                &request.time_control,
                &request.source_url,
            ],
        )
        .map_err(|_| "Không thể lưu ván cờ vào máy.".to_string())?;
    Ok(id)
}

#[tauri::command]
fn list_saved_games(
    database: tauri::State<'_, DatabaseState>,
) -> Result<Vec<SavedGameSummary>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT id, white, black, white_elo, black_elo, result, event, game_date, eco,
                    time_control, source_url, created_at, last_opened_at
             FROM saved_games
             ORDER BY last_opened_at DESC, created_at DESC",
        )
        .map_err(|_| "Không thể đọc kho ván cờ.".to_string())?;
    let games = statement
        .query_map([], |row| {
            Ok(SavedGameSummary {
                id: row.get(0)?,
                white: row.get(1)?,
                black: row.get(2)?,
                white_elo: row.get(3)?,
                black_elo: row.get(4)?,
                result: row.get(5)?,
                event: row.get(6)?,
                date: row.get(7)?,
                eco: row.get(8)?,
                time_control: row.get(9)?,
                source_url: row.get(10)?,
                created_at: row.get(11)?,
                last_opened_at: row.get(12)?,
            })
        })
        .map_err(|_| "Không thể đọc danh sách ván đã lưu.".to_string())?;
    games
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu kho ván cờ không hợp lệ.".to_string())
}

#[tauri::command]
fn open_saved_game(
    database: tauri::State<'_, DatabaseState>,
    id: String,
) -> Result<SavedGameDetail, String> {
    if id.len() != 64 || !id.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Mã ván cờ không hợp lệ.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let updated = connection
        .execute(
            "UPDATE saved_games SET last_opened_at = datetime('now') WHERE id = ?1",
            params![&id],
        )
        .map_err(|_| "Không thể cập nhật ván vừa mở.".to_string())?;
    if updated == 0 {
        return Err("Ván cờ không còn trong kho.".to_string());
    }
    connection
        .query_row(
            "SELECT id, pgn FROM saved_games WHERE id = ?1",
            params![&id],
            |row| {
                Ok(SavedGameDetail {
                    id: row.get(0)?,
                    pgn: row.get(1)?,
                })
            },
        )
        .map_err(|_| "Không thể đọc PGN đã lưu.".to_string())
}

#[tauri::command]
fn delete_saved_game(
    database: tauri::State<'_, DatabaseState>,
    id: String,
) -> Result<bool, String> {
    if id.len() != 64 || !id.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Mã ván cờ không hợp lệ.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    connection
        .execute("DELETE FROM saved_games WHERE id = ?1", params![id])
        .map(|count| count > 0)
        .map_err(|_| "Không thể xoá ván cờ khỏi kho.".to_string())
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

fn game_summary_cache_key(provider: &str, model: &str, request: &ExplainGameRequest) -> String {
    let mut hasher = Sha256::new();
    hasher.update(GAME_SUMMARY_PROMPT_VERSION.as_bytes());
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
    prompt_version: &str,
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
            params![cache_key, provider, model, prompt_version, text],
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
        "ben_vua_di": request.side_just_moved,
        "ben_toi_luot": request.side_to_move,
        "giai_doan": request.phase,
        "so_nuoc": request.move_number,
        "nuoc_da_di": request.played_move,
        "fen_truoc": request.fen_before,
        "fen_sau": request.fen_after,
        "danh_gia_sau_nuoc": request.evaluation,
        "centipawn_loss": request.centipawn_loss,
        "nuoc_tot_nhat": request.best_move,
        "bien_chinh": request.best_line,
        "nuoc_dap_tot_nhat": request.best_reply,
        "bien_dap": request.reply_line,
    })
}

async fn request_openai(
    client: &Client,
    key: &str,
    model: &str,
    instructions: &str,
    input: &Value,
    max_output_tokens: u32,
) -> Result<String, String> {
    let payload = serde_json::json!({
        "model": model,
        "store": false,
        "reasoning": { "effort": "low" },
        "text": { "verbosity": "low" },
        "max_output_tokens": max_output_tokens,
        "instructions": instructions,
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

async fn request_gemini_once(
    client: &Client,
    key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    max_output_tokens: u32,
) -> Result<String, String> {
    let payload = serde_json::json!({
        "systemInstruction": { "parts": [{ "text": system_prompt }] },
        "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
        "generationConfig": { "maxOutputTokens": max_output_tokens }
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

async fn request_gemini(
    client: &Client,
    key: &str,
    model: &str,
    system_prompt: &str,
    input: &Value,
    max_output_tokens: u32,
) -> Result<String, String> {
    let input_text = input.to_string();
    let text = request_gemini_once(
        client,
        key,
        model,
        system_prompt,
        &input_text,
        max_output_tokens,
    )
    .await?;
    if has_vietnamese_diacritics(&text) {
        return Ok(text);
    }

    let retry_prompt = format!(
        "{system_prompt} Phản hồi trước đã vi phạm vì viết tiếng Việt không dấu. Lần này bắt buộc mọi từ tiếng Việt phải có dấu chính xác."
    );
    let retry_input = format!(
        "Dữ liệu phân tích: {input_text}\nPhản hồi không dấu cần viết lại: {text}\nHãy viết lại nội dung thành tiếng Việt có dấu đầy đủ, vẫn tuân thủ độ dài và cấu trúc đã yêu cầu."
    );
    let retried = request_gemini_once(
        client,
        key,
        model,
        &retry_prompt,
        &retry_input,
        max_output_tokens,
    )
    .await?;
    if has_vietnamese_diacritics(&retried) {
        Ok(retried)
    } else {
        Err("Gemini vẫn trả về tiếng Việt không dấu sau khi tự thử lại.".to_string())
    }
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
        request_gemini(&client, &key, &model, COACH_PROMPT, &input, 250).await?
    } else {
        request_openai(&client, &key, &model, COACH_PROMPT, &input, 250).await?
    };
    write_cached_explanation(
        &database,
        &cache_key,
        provider,
        &model,
        PROMPT_VERSION,
        &text,
    )?;
    Ok(AiExplanation {
        text,
        provider: provider.to_string(),
        model,
        cached: false,
    })
}

#[tauri::command]
async fn summarize_game(
    state: tauri::State<'_, ApiKeyState>,
    database: tauri::State<'_, DatabaseState>,
    request: ExplainGameRequest,
    provider: String,
    model: String,
    force_refresh: bool,
) -> Result<AiExplanation, String> {
    let provider = normalized_provider(&provider)?;
    validate_model(provider, &model)?;
    let cache_key = game_summary_cache_key(provider, &model, &request);
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
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|_| "Không thể khởi tạo kết nối AI.".to_string())?;
    let input = serde_json::to_value(&request)
        .map_err(|_| "Không thể chuẩn bị dữ liệu tổng kết ván đấu.".to_string())?;
    let text = if provider == "gemini" {
        request_gemini(&client, &key, &model, GAME_SUMMARY_PROMPT, &input, 700).await?
    } else {
        request_openai(&client, &key, &model, GAME_SUMMARY_PROMPT, &input, 700).await?
    };
    write_cached_explanation(
        &database,
        &cache_key,
        provider,
        &model,
        GAME_SUMMARY_PROMPT_VERSION,
        &text,
    )?;
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
                ON ai_explanations(provider, model);
                CREATE TABLE IF NOT EXISTS saved_games (
                    id TEXT PRIMARY KEY,
                    pgn TEXT NOT NULL,
                    white TEXT NOT NULL,
                    black TEXT NOT NULL,
                    white_elo TEXT,
                    black_elo TEXT,
                    result TEXT,
                    event TEXT,
                    game_date TEXT,
                    eco TEXT,
                    time_control TEXT,
                    source_url TEXT,
                    created_at TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_saved_games_last_opened
                ON saved_games(last_opened_at DESC);",
            )?;
            app.manage(DatabaseState(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_chess_com_game,
            save_game,
            list_saved_games,
            open_saved_game,
            delete_saved_game,
            set_api_key,
            clear_api_key,
            has_api_key,
            get_cached_explanation,
            clear_ai_cache,
            explain_move,
            summarize_game
        ])
        .run(tauri::generate_context!())
        .expect("không thể khởi chạy ứng dụng Chess Coach");
}
