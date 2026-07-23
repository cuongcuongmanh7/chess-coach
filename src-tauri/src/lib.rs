use reqwest::{Client, Url};
use rusqlite::{params, Connection, DatabaseName, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::ops::{Deref, DerefMut};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;

#[derive(Default)]
struct ApiKeyState {
    openai: Mutex<Option<String>>,
    gemini: Mutex<Option<String>>,
}

struct ActiveDatabase {
    connection: Connection,
    data_dir: PathBuf,
    active_uid: Option<String>,
    generation: u64,
}

impl Deref for ActiveDatabase {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        &self.connection
    }
}

impl DerefMut for ActiveDatabase {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.connection
    }
}

struct DatabaseState(Mutex<ActiveDatabase>);

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
    played_at: Option<String>,
    eco: Option<String>,
    opening: Option<String>,
    time_control: Option<String>,
    time_class: Option<String>,
    source_url: Option<String>,
    source_platform: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
struct CloudPlayerProfile {
    platform: String,
    username: String,
    last_sync_at: Option<String>,
    created_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct CloudSavedGame {
    id: String,
    pgn: String,
    white: String,
    black: String,
    white_elo: Option<String>,
    black_elo: Option<String>,
    result: Option<String>,
    event: Option<String>,
    date: Option<String>,
    played_at: Option<String>,
    eco: Option<String>,
    opening: Option<String>,
    time_control: Option<String>,
    time_class: Option<String>,
    source_url: Option<String>,
    source_platform: Option<String>,
    created_at: String,
    last_opened_at: String,
    profile_keys: Vec<String>,
}

#[derive(Deserialize)]
struct CloudRemoteProfileChange {
    document_id: String,
    deleted: bool,
    needs_upgrade: bool,
    data: Option<CloudPlayerProfile>,
}

#[derive(Deserialize)]
struct CloudRemoteGameChange {
    document_id: String,
    deleted: bool,
    needs_upgrade: bool,
    data: Option<CloudSavedGame>,
}

#[derive(Deserialize)]
struct MergeCloudChangesRequest {
    profiles: Vec<CloudRemoteProfileChange>,
    games: Vec<CloudRemoteGameChange>,
}

#[derive(Serialize)]
struct CloudPendingProfileChange {
    document_id: String,
    generation: i64,
    attempts: i64,
    deleted: bool,
    data: Option<CloudPlayerProfile>,
}

#[derive(Serialize)]
struct CloudPendingGameChange {
    document_id: String,
    generation: i64,
    attempts: i64,
    deleted: bool,
    data: Option<CloudSavedGame>,
}

#[derive(Serialize)]
struct CloudSyncBatch {
    profiles: Vec<CloudPendingProfileChange>,
    games: Vec<CloudPendingGameChange>,
}

#[derive(Clone, Deserialize)]
struct CloudAckToken {
    entity_type: String,
    entity_id: String,
    generation: i64,
}

#[derive(Clone, Deserialize, Serialize, Default)]
struct CloudSyncCursor {
    initialized: bool,
    updated_at_seconds: Option<i64>,
    updated_at_nanoseconds: Option<i64>,
    document_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, Default)]
struct CloudSyncCursors {
    profiles: CloudSyncCursor,
    games: CloudSyncCursor,
}

#[derive(Serialize)]
struct CloudMergeResult {
    profiles_added: usize,
    games_added: usize,
    profiles_deleted: usize,
    games_deleted: usize,
}

#[derive(Serialize)]
struct DatabaseActivationResult {
    changed: bool,
    claimed_legacy_data: bool,
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
    played_at: Option<String>,
    eco: Option<String>,
    opening: Option<String>,
    time_control: Option<String>,
    time_class: Option<String>,
    source_url: Option<String>,
    source_platform: Option<String>,
    analysis_complete: bool,
    created_at: String,
    last_opened_at: String,
}

#[derive(Serialize)]
struct SavedGameDetail {
    id: String,
    pgn: String,
}

#[derive(Serialize)]
struct PlayerProfileSummary {
    id: i64,
    platform: String,
    username: String,
    game_count: u32,
    last_sync_at: Option<String>,
    created_at: String,
}

#[derive(Deserialize)]
struct SaveEngineAnalysisRequest {
    game_id: String,
    ply: u32,
    depth: u32,
    result: Value,
    color: String,
    phase: String,
    quality: String,
    centipawn_loss: f64,
    think_time_seconds: Option<f64>,
    is_quick: bool,
    is_time_pressure: bool,
    tags: Vec<String>,
}

#[derive(Serialize)]
struct StoredEngineAnalysis {
    ply: u32,
    depth: u32,
    result: Value,
}

#[derive(Serialize)]
struct DashboardMoveRecord {
    game_id: String,
    date: Option<String>,
    eco: Option<String>,
    opening: Option<String>,
    time_control: Option<String>,
    time_class: Option<String>,
    player_color: String,
    phase: String,
    quality: String,
    centipawn_loss: f64,
    think_time_seconds: Option<f64>,
    is_quick: bool,
    is_time_pressure: bool,
    tags: Vec<String>,
}

#[derive(Deserialize)]
struct FetchRecentGamesRequest {
    platform: String,
    username: String,
    limit: usize,
    time_class: Option<String>,
}

const COACH_PROMPT: &str = "Bạn là huấn luyện viên cờ vua nói tiếng Việt. Luôn viết tiếng Việt có dấu đầy đủ bằng Unicode; không được bỏ dấu ở bất kỳ từ tiếng Việt nào. Dữ liệu Stockfish và các trường màu quân là nguồn sự thật. Viết tổng cộng 70–90 từ trên đúng bốn dòng theo mẫu: 'ĐÁNH GIÁ: ...', 'Ý TƯỞNG: ...', 'SO SÁNH: ...', 'KẾ HOẠCH: ...'. Mỗi nhãn và toàn bộ nội dung của nhãn đó bắt buộc nằm trên cùng một dòng. Dòng ĐÁNH GIÁ kết luận thẳng về nước của ben_vua_di. Dòng Ý TƯỞNG giải thích lý do cụ thể. Dòng SO SÁNH đối chiếu ngắn với nuoc_tot_nhat. Dòng KẾ HOẠCH chỉ khuyên ben_toi_luot chơi nuoc_dap_tot_nhat sau vị trí thực tế; nếu không có nước đáp thì nói ván đã kết thúc. Khi nhắc quân đang tấn công, phòng thủ hoặc bị hạn chế, phải gọi đúng màu Trắng hoặc Đen theo ben_vua_di và ben_toi_luot; tuyệt đối không tự đảo màu quân. Bắt đầu ngay bằng nhãn, không chào hỏi, không câu chúc, không khen xã giao và không dùng lời dẫn. Giữ nguyên mọi ký hiệu nước cờ theo SAN như Bf4, e3, dxc4 hoặc O-O; không dịch hay đọc chúng thành chữ. Mọi điểm đánh giá phải giữ dạng có dấu và chữ số thập phân giống dữ liệu đầu vào, ví dụ +0.38 hoặc -1.25; tuyệt đối không viết số hay dấu thành chữ. Dùng Elo chỉ để điều chỉnh độ khó, không nhắc Elo trong câu trả lời. Không đưa lời khuyên chung chung; phải nêu quân, ô hoặc kế hoạch cụ thể. Tuyệt đối không chép hoặc nhắc tên khóa dữ liệu nội bộ như nuoc_tot_nhat, nuoc_dap_tot_nhat, ben_vua_di hay ben_toi_luot; chỉ diễn đạt ý nghĩa và giá trị thật của chúng bằng tiếng Việt tự nhiên. Không dùng Markdown, không nhắc lại FEN và không bịa thêm biến ngoài dữ liệu được cung cấp.";
const PROMPT_VERSION: &str = "coach-v7";
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
        .user_agent("ChessCoachVN/0.5.0 (local desktop app)")
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

fn profile_cloud_key(platform: &str, username: &str) -> String {
    format!("{platform}_{}", username.trim().to_ascii_lowercase())
}

fn queue_cloud_change(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    operation: &str,
) -> rusqlite::Result<()> {
    connection.execute(
        "INSERT INTO cloud_sync_queue
         (entity_type, entity_id, operation, generation, attempts, next_retry_at, last_error, updated_at)
         VALUES (?1, ?2, ?3, 1, 0, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           operation = excluded.operation,
           generation = cloud_sync_queue.generation + 1,
           attempts = 0,
           next_retry_at = NULL,
           last_error = NULL,
           updated_at = excluded.updated_at",
        params![entity_type, entity_id, operation],
    )?;
    Ok(())
}

fn pending_cloud_operation(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> rusqlite::Result<Option<String>> {
    connection
        .query_row(
            "SELECT operation FROM cloud_sync_queue
             WHERE entity_type = ?1 AND entity_id = ?2",
            params![entity_type, entity_id],
            |row| row.get(0),
        )
        .optional()
}

fn queue_games_for_profile(connection: &Connection, profile_id: i64) -> rusqlite::Result<()> {
    let game_ids = {
        let mut statement =
            connection.prepare("SELECT game_id FROM game_profiles WHERE profile_id = ?1")?;
        let rows = statement
            .query_map(params![profile_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for game_id in game_ids {
        queue_cloud_change(connection, "game", &game_id, "upsert")?;
    }
    Ok(())
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
    let played_at = request
        .played_at
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| played_at_from_pgn(&normalized_pgn));
    let source_platform = normalized_platform(request.source_platform.as_deref())
        .map(str::to_string)
        .or_else(|| {
            request.source_url.as_deref().and_then(|url| {
                if url.contains("lichess.org") {
                    Some("lichess".to_string())
                } else if url.contains("chess.com") {
                    Some("chesscom".to_string())
                } else {
                    None
                }
            })
        });
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    connection
        .execute(
            "INSERT INTO saved_games
             (id, pgn, white, black, white_elo, black_elo, result, event, game_date, played_at,
              eco, opening, time_control, time_class, source_url, source_platform, created_at, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               pgn = excluded.pgn,
               white = excluded.white,
               black = excluded.black,
               white_elo = excluded.white_elo,
               black_elo = excluded.black_elo,
               result = excluded.result,
               event = excluded.event,
               game_date = excluded.game_date,
               played_at = COALESCE(excluded.played_at, saved_games.played_at),
               eco = excluded.eco,
               opening = excluded.opening,
               time_control = excluded.time_control,
               time_class = excluded.time_class,
               source_url = COALESCE(excluded.source_url, saved_games.source_url),
               source_platform = COALESCE(excluded.source_platform, saved_games.source_platform),
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
                &played_at,
                &request.eco,
                &request.opening,
                &request.time_control,
                &request.time_class,
                &request.source_url,
                &source_platform,
            ],
        )
        .map_err(|_| "Không thể lưu ván cờ vào máy.".to_string())?;
    connection
        .execute(
            "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
             SELECT ?1, pp.id,
                    CASE WHEN lower(pp.username) = lower(?2) THEN 'w' ELSE 'b' END,
                    datetime('now')
             FROM player_profiles pp
             WHERE (lower(pp.username) = lower(?2) OR lower(pp.username) = lower(?3))
               AND (?4 IS NULL OR pp.platform = ?4)",
            params![&id, &request.white, &request.black, &source_platform],
        )
        .map_err(|_| "Không thể liên kết ván với hồ sơ người chơi.".to_string())?;
    queue_cloud_change(&connection, "game", &id, "upsert")
        .map_err(|_| "Không thể xếp ván vào hàng đợi đồng bộ.".to_string())?;
    Ok(id)
}

#[tauri::command]
fn list_saved_games(
    database: tauri::State<'_, DatabaseState>,
    profile_id: Option<i64>,
) -> Result<Vec<SavedGameSummary>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT id, white, black, white_elo, black_elo, result, event, game_date, played_at, eco,
                    opening, time_control, time_class, source_url, source_platform,
                    analysis_complete, created_at, last_opened_at
             FROM saved_games sg
             WHERE ?1 IS NULL OR EXISTS (
               SELECT 1 FROM game_profiles gp WHERE gp.game_id = sg.id AND gp.profile_id = ?1
             )
             ORDER BY COALESCE(NULLIF(played_at, ''), REPLACE(game_date, '.', '-'), created_at) DESC,
                      created_at DESC",
        )
        .map_err(|_| "Không thể đọc kho ván cờ.".to_string())?;
    let games = statement
        .query_map(params![profile_id], |row| {
            Ok(SavedGameSummary {
                id: row.get(0)?,
                white: row.get(1)?,
                black: row.get(2)?,
                white_elo: row.get(3)?,
                black_elo: row.get(4)?,
                result: row.get(5)?,
                event: row.get(6)?,
                date: row.get(7)?,
                played_at: row.get(8)?,
                eco: row.get(9)?,
                opening: row.get(10)?,
                time_control: row.get(11)?,
                time_class: row.get(12)?,
                source_url: row.get(13)?,
                source_platform: row.get(14)?,
                analysis_complete: row.get::<_, i64>(15)? != 0,
                created_at: row.get(16)?,
                last_opened_at: row.get(17)?,
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
    queue_cloud_change(&connection, "game", &id, "upsert")
        .map_err(|_| "Không thể cập nhật hàng đợi cloud cho ván vừa mở.".to_string())?;
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
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu xoá ván cờ.".to_string())?;
    transaction
        .execute(
            "DELETE FROM engine_analyses WHERE game_id = ?1",
            params![&id],
        )
        .map_err(|_| "Không thể xoá dữ liệu phân tích của ván.".to_string())?;
    transaction
        .execute("DELETE FROM game_profiles WHERE game_id = ?1", params![&id])
        .map_err(|_| "Không thể xoá liên kết hồ sơ của ván.".to_string())?;
    let deleted = transaction
        .execute("DELETE FROM saved_games WHERE id = ?1", params![&id])
        .map_err(|_| "Không thể xoá ván cờ khỏi kho.".to_string())?
        > 0;
    if deleted {
        queue_cloud_change(&transaction, "game", &id, "delete")
            .map_err(|_| "Không thể xếp thao tác xoá vào hàng đợi cloud.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất xoá ván cờ.".to_string())?;
    Ok(deleted)
}

const ENGINE_VERSION: &str = "stockfish-18-lite";

fn validate_game_id(id: &str) -> Result<(), String> {
    if id.len() == 64 && id.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Mã ván cờ không hợp lệ.".to_string())
    }
}

#[tauri::command]
fn save_engine_analysis(
    database: tauri::State<'_, DatabaseState>,
    request: SaveEngineAnalysisRequest,
) -> Result<(), String> {
    validate_game_id(&request.game_id)?;
    let result_json = serde_json::to_string(&request.result)
        .map_err(|_| "Không thể mã hoá kết quả Stockfish.".to_string())?;
    let tags_json = serde_json::to_string(&request.tags)
        .map_err(|_| "Không thể mã hoá nhãn phân tích.".to_string())?;
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho phân tích.".to_string())?;
    let game_exists = connection
        .query_row(
            "SELECT 1 FROM saved_games WHERE id = ?1",
            params![&request.game_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|_| "Không thể kiểm tra ván trước khi lưu phân tích.".to_string())?
        .is_some();
    if !game_exists {
        return Ok(());
    }
    connection
        .execute(
            "INSERT INTO engine_analyses
             (game_id, ply, engine_version, depth, result_json, color, phase, quality,
              centipawn_loss, think_time_seconds, is_quick, is_time_pressure, tags_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'))
             ON CONFLICT(game_id, ply, engine_version) DO UPDATE SET
               depth = CASE WHEN excluded.depth >= engine_analyses.depth THEN excluded.depth ELSE engine_analyses.depth END,
               result_json = CASE WHEN excluded.depth >= engine_analyses.depth THEN excluded.result_json ELSE engine_analyses.result_json END,
               color = excluded.color,
               phase = excluded.phase,
               quality = CASE WHEN excluded.depth >= engine_analyses.depth THEN excluded.quality ELSE engine_analyses.quality END,
               centipawn_loss = CASE WHEN excluded.depth >= engine_analyses.depth THEN excluded.centipawn_loss ELSE engine_analyses.centipawn_loss END,
               think_time_seconds = excluded.think_time_seconds,
               is_quick = excluded.is_quick,
               is_time_pressure = excluded.is_time_pressure,
               tags_json = excluded.tags_json,
               updated_at = datetime('now')",
            params![
                &request.game_id,
                request.ply,
                ENGINE_VERSION,
                request.depth,
                result_json,
                &request.color,
                &request.phase,
                &request.quality,
                request.centipawn_loss,
                request.think_time_seconds,
                request.is_quick,
                request.is_time_pressure,
                tags_json,
            ],
        )
        .map_err(|_| "Không thể lưu kết quả Stockfish.".to_string())?;
    Ok(())
}

#[tauri::command]
fn list_engine_analyses(
    database: tauri::State<'_, DatabaseState>,
    game_id: String,
) -> Result<Vec<StoredEngineAnalysis>, String> {
    validate_game_id(&game_id)?;
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho phân tích.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT ply, depth, result_json FROM engine_analyses
             WHERE game_id = ?1 AND engine_version = ?2 ORDER BY ply",
        )
        .map_err(|_| "Không thể đọc kết quả Stockfish đã lưu.".to_string())?;
    let rows = statement
        .query_map(params![game_id, ENGINE_VERSION], |row| {
            let raw: String = row.get(2)?;
            let result = serde_json::from_str(&raw).unwrap_or(Value::Null);
            Ok(StoredEngineAnalysis {
                ply: row.get(0)?,
                depth: row.get(1)?,
                result,
            })
        })
        .map_err(|_| "Không thể đọc danh sách kết quả Stockfish.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu Stockfish đã lưu không hợp lệ.".to_string())
}

#[tauri::command]
fn mark_game_analysis_complete(
    database: tauri::State<'_, DatabaseState>,
    game_id: String,
) -> Result<(), String> {
    validate_game_id(&game_id)?;
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho ván cờ.".to_string())?;
    connection
        .execute(
            "UPDATE saved_games SET analysis_complete = 1, analyzed_at = datetime('now') WHERE id = ?1",
            params![game_id],
        )
        .map_err(|_| "Không thể đánh dấu ván đã phân tích.".to_string())?;
    Ok(())
}

#[tauri::command]
fn get_dashboard_records(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<Vec<DashboardMoveRecord>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở kho thống kê.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT ea.game_id, COALESCE(sg.played_at, sg.game_date), sg.eco, sg.opening, sg.time_control, sg.time_class,
                    ea.color, ea.phase, ea.quality, ea.centipawn_loss, ea.think_time_seconds,
                    ea.is_quick, ea.is_time_pressure, ea.tags_json
             FROM engine_analyses ea
             JOIN saved_games sg ON sg.id = ea.game_id
             JOIN game_profiles gp ON gp.game_id = sg.id AND gp.profile_id = ?1
             WHERE sg.analysis_complete = 1
               AND ea.engine_version = ?2
               AND ea.color = gp.player_color
             ORDER BY COALESCE(NULLIF(sg.played_at, ''), REPLACE(sg.game_date, '.', '-'), sg.created_at), ea.ply",
        )
        .map_err(|_| "Không thể chuẩn bị dữ liệu tiến bộ.".to_string())?;
    let rows = statement
        .query_map(params![profile_id, ENGINE_VERSION], |row| {
            let tags_json: String = row.get(13)?;
            Ok(DashboardMoveRecord {
                game_id: row.get(0)?,
                date: row.get(1)?,
                eco: row.get(2)?,
                opening: row.get(3)?,
                time_control: row.get(4)?,
                time_class: row.get(5)?,
                player_color: row.get(6)?,
                phase: row.get(7)?,
                quality: row.get(8)?,
                centipawn_loss: row.get(9)?,
                think_time_seconds: row.get(10)?,
                is_quick: row.get::<_, i64>(11)? != 0,
                is_time_pressure: row.get::<_, i64>(12)? != 0,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
            })
        })
        .map_err(|_| "Không thể đọc dữ liệu tiến bộ.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu tiến bộ không hợp lệ.".to_string())
}

fn normalized_platform(value: Option<&str>) -> Option<&str> {
    match value {
        Some("chesscom") => Some("chesscom"),
        Some("lichess") => Some("lichess"),
        _ => None,
    }
}

fn pgn_header_value<'a>(pgn: &'a str, tag: &str) -> Option<&'a str> {
    let prefix = format!("[{tag} \"");
    pgn.lines().find_map(|line| {
        line.trim()
            .strip_prefix(&prefix)
            .and_then(|value| value.strip_suffix("\"]"))
    })
}

fn normalized_pgn_date(value: &str) -> Option<String> {
    let normalized = value.trim().replace('.', "-");
    let parts: Vec<&str> = normalized.split('-').collect();
    if parts.len() == 3
        && parts[0].len() == 4
        && parts[1].len() == 2
        && parts[2].len() == 2
        && parts
            .iter()
            .all(|part| part.chars().all(|character| character.is_ascii_digit()))
    {
        Some(normalized)
    } else {
        None
    }
}

fn normalized_pgn_time(value: &str) -> Option<String> {
    let parts: Vec<&str> = value.trim().split(':').collect();
    if (2..=3).contains(&parts.len())
        && parts
            .iter()
            .all(|part| part.len() == 2 && part.chars().all(|character| character.is_ascii_digit()))
    {
        Some(if parts.len() == 2 {
            format!("{}:00", value.trim())
        } else {
            value.trim().to_string()
        })
    } else {
        None
    }
}

fn played_at_from_pgn(pgn: &str) -> Option<String> {
    let date = ["UTCDate", "EndDate", "Date"]
        .iter()
        .find_map(|tag| pgn_header_value(pgn, tag).and_then(normalized_pgn_date))?;
    let time = ["UTCTime", "EndTime", "StartTime"]
        .iter()
        .find_map(|tag| pgn_header_value(pgn, tag).and_then(normalized_pgn_time));
    Some(time.map_or(date.clone(), |time| format!("{date} {time}")))
}

fn backfill_played_at(connection: &Connection) -> rusqlite::Result<()> {
    let missing = {
        let mut statement = connection
            .prepare("SELECT id, pgn FROM saved_games WHERE played_at IS NULL OR played_at = ''")?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (id, pgn) in missing {
        if let Some(played_at) = played_at_from_pgn(&pgn) {
            connection.execute(
                "UPDATE saved_games SET played_at = ?1 WHERE id = ?2",
                params![played_at, id],
            )?;
        }
    }
    Ok(())
}

#[tauri::command]
fn list_player_profiles(
    database: tauri::State<'_, DatabaseState>,
) -> Result<Vec<PlayerProfileSummary>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT pp.id, pp.platform, pp.username, COUNT(gp.game_id), pp.last_sync_at, pp.created_at
             FROM player_profiles pp
             LEFT JOIN game_profiles gp ON gp.profile_id = pp.id
             GROUP BY pp.id
             ORDER BY pp.created_at, pp.id",
        )
        .map_err(|_| "Không thể đọc danh sách hồ sơ.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(PlayerProfileSummary {
                id: row.get(0)?,
                platform: row.get(1)?,
                username: row.get(2)?,
                game_count: row.get(3)?,
                last_sync_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|_| "Không thể đọc hồ sơ người chơi.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Dữ liệu hồ sơ không hợp lệ.".to_string())
}

#[tauri::command]
fn add_player_profile(
    database: tauri::State<'_, DatabaseState>,
    platform: String,
    username: String,
) -> Result<PlayerProfileSummary, String> {
    let platform = normalized_platform(Some(platform.as_str()))
        .ok_or_else(|| "Nền tảng hồ sơ không hợp lệ.".to_string())?;
    let username = username.trim();
    if !valid_username(username) {
        return Err("Username chỉ được chứa chữ, số, gạch ngang hoặc gạch dưới.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    connection
        .execute(
            "INSERT OR IGNORE INTO player_profiles (platform, username, created_at)
             VALUES (?1, ?2, datetime('now'))",
            params![platform, username],
        )
        .map_err(|_| "Không thể thêm hồ sơ.".to_string())?;
    let profile_id: i64 = connection
        .query_row(
            "SELECT id FROM player_profiles WHERE platform = ?1 AND username = ?2 COLLATE NOCASE",
            params![platform, username],
            |row| row.get(0),
        )
        .map_err(|_| "Không thể đọc hồ sơ vừa thêm.".to_string())?;
    connection
        .execute(
            "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
             SELECT sg.id, ?1,
                    CASE WHEN lower(sg.white) = lower(?2) THEN 'w' ELSE 'b' END,
                    datetime('now')
             FROM saved_games sg
             WHERE (lower(sg.white) = lower(?2) OR lower(sg.black) = lower(?2))
               AND (sg.source_platform IS NULL OR sg.source_platform = ?3)",
            params![profile_id, username, platform],
        )
        .map_err(|_| "Không thể liên kết các ván cũ với hồ sơ.".to_string())?;
    let cloud_key = profile_cloud_key(platform, username);
    queue_cloud_change(&connection, "profile", &cloud_key, "upsert")
        .map_err(|_| "Không thể xếp hồ sơ vào hàng đợi đồng bộ.".to_string())?;
    queue_games_for_profile(&connection, profile_id)
        .map_err(|_| "Không thể cập nhật hàng đợi ván của hồ sơ.".to_string())?;
    connection
        .query_row(
            "SELECT pp.id, pp.platform, pp.username, COUNT(gp.game_id), pp.last_sync_at, pp.created_at
             FROM player_profiles pp LEFT JOIN game_profiles gp ON gp.profile_id = pp.id
             WHERE pp.id = ?1 GROUP BY pp.id",
            params![profile_id],
            |row| {
                Ok(PlayerProfileSummary {
                    id: row.get(0)?,
                    platform: row.get(1)?,
                    username: row.get(2)?,
                    game_count: row.get(3)?,
                    last_sync_at: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(|_| "Không thể trả về hồ sơ vừa thêm.".to_string())
}

#[tauri::command]
fn delete_player_profile(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<(), String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    let total: i64 = connection
        .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
        .map_err(|_| "Không thể kiểm tra số hồ sơ.".to_string())?;
    if total <= 1 {
        return Err("Cần giữ lại ít nhất một hồ sơ.".to_string());
    }
    let (platform, username): (String, String) = connection
        .query_row(
            "SELECT platform, username FROM player_profiles WHERE id = ?1",
            params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Không tìm thấy hồ sơ cần xoá.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu xoá hồ sơ.".to_string())?;
    queue_games_for_profile(&transaction, profile_id)
        .map_err(|_| "Không thể cập nhật các ván liên quan trong hàng đợi.".to_string())?;
    transaction
        .execute(
            "DELETE FROM game_profiles WHERE profile_id = ?1",
            params![profile_id],
        )
        .map_err(|_| "Không thể xoá liên kết hồ sơ.".to_string())?;
    transaction
        .execute(
            "DELETE FROM player_profiles WHERE id = ?1",
            params![profile_id],
        )
        .map_err(|_| "Không thể xoá hồ sơ.".to_string())?;
    let cloud_key = profile_cloud_key(&platform, &username);
    queue_cloud_change(&transaction, "profile", &cloud_key, "delete")
        .map_err(|_| "Không thể xếp thao tác xoá hồ sơ vào hàng đợi cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất xoá hồ sơ.".to_string())?;
    Ok(())
}

#[tauri::command]
fn mark_profile_synced(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<(), String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở danh sách hồ sơ.".to_string())?;
    connection
        .execute(
            "UPDATE player_profiles SET last_sync_at = datetime('now') WHERE id = ?1",
            params![profile_id],
        )
        .map_err(|_| "Không thể cập nhật thời gian đồng bộ.".to_string())?;
    let (platform, username): (String, String) = connection
        .query_row(
            "SELECT platform, username FROM player_profiles WHERE id = ?1",
            params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Không thể đọc hồ sơ vừa đồng bộ.".to_string())?;
    queue_cloud_change(
        &connection,
        "profile",
        &profile_cloud_key(&platform, &username),
        "upsert",
    )
    .map_err(|_| "Không thể xếp hồ sơ vào hàng đợi cloud.".to_string())?;
    Ok(())
}

fn cloud_profile_by_key(
    connection: &Connection,
    document_id: &str,
) -> rusqlite::Result<Option<CloudPlayerProfile>> {
    connection
        .query_row(
            "SELECT platform, username, last_sync_at, created_at
             FROM player_profiles
             WHERE platform || '_' || lower(username) = ?1",
            params![document_id],
            |row| {
                Ok(CloudPlayerProfile {
                    platform: row.get(0)?,
                    username: row.get(1)?,
                    last_sync_at: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )
        .optional()
}

fn cloud_game_by_id(
    connection: &Connection,
    game_id: &str,
) -> rusqlite::Result<Option<CloudSavedGame>> {
    connection
        .query_row(
            "SELECT sg.id, sg.pgn, sg.white, sg.black, sg.white_elo, sg.black_elo,
                    sg.result, sg.event, sg.game_date, sg.played_at, sg.eco, sg.opening,
                    sg.time_control, sg.time_class, sg.source_url, sg.source_platform,
                    sg.created_at, sg.last_opened_at,
                    COALESCE((
                      SELECT GROUP_CONCAT(pp.platform || ':' || lower(pp.username), '|')
                      FROM game_profiles gp
                      JOIN player_profiles pp ON pp.id = gp.profile_id
                      WHERE gp.game_id = sg.id
                    ), '')
             FROM saved_games sg
             WHERE sg.id = ?1",
            params![game_id],
            |row| {
                let profile_keys: String = row.get(18)?;
                Ok(CloudSavedGame {
                    id: row.get(0)?,
                    pgn: row.get(1)?,
                    white: row.get(2)?,
                    black: row.get(3)?,
                    white_elo: row.get(4)?,
                    black_elo: row.get(5)?,
                    result: row.get(6)?,
                    event: row.get(7)?,
                    date: row.get(8)?,
                    played_at: row.get(9)?,
                    eco: row.get(10)?,
                    opening: row.get(11)?,
                    time_control: row.get(12)?,
                    time_class: row.get(13)?,
                    source_url: row.get(14)?,
                    source_platform: row.get(15)?,
                    created_at: row.get(16)?,
                    last_opened_at: row.get(17)?,
                    profile_keys: profile_keys
                        .split('|')
                        .filter(|value| !value.is_empty())
                        .map(str::to_string)
                        .collect(),
                })
            },
        )
        .optional()
}

fn pending_rows(
    connection: &Connection,
    entity_type: &str,
) -> Result<Vec<(String, i64, i64, String)>, String> {
    let mut statement = connection
        .prepare(
            "SELECT entity_id, generation, attempts, operation
             FROM cloud_sync_queue
             WHERE entity_type = ?1
             ORDER BY updated_at, entity_id",
        )
        .map_err(|_| "Không thể chuẩn bị hàng đợi cloud.".to_string())?;
    let rows = statement
        .query_map(params![entity_type], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|_| "Không thể đọc hàng đợi cloud.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Hàng đợi cloud không hợp lệ.".to_string())?;
    Ok(rows)
}

#[tauri::command]
fn export_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
) -> Result<CloudSyncBatch, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở dữ liệu để đồng bộ.".to_string())?;

    let profiles = pending_rows(&connection, "profile")?
        .into_iter()
        .map(|(document_id, generation, attempts, operation)| {
            let deleted = operation == "delete";
            let data = if deleted {
                None
            } else {
                cloud_profile_by_key(&connection, &document_id)
                    .map_err(|_| "Không thể đọc hồ sơ đang chờ đồng bộ.".to_string())?
            };
            if !deleted && data.is_none() {
                return Err("Hồ sơ trong hàng đợi cloud không còn tồn tại.".to_string());
            }
            Ok(CloudPendingProfileChange {
                document_id,
                generation,
                attempts,
                deleted,
                data,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let games = pending_rows(&connection, "game")?
        .into_iter()
        .map(|(document_id, generation, attempts, operation)| {
            let deleted = operation == "delete";
            let data = if deleted {
                None
            } else {
                cloud_game_by_id(&connection, &document_id)
                    .map_err(|_| "Không thể đọc ván đang chờ đồng bộ.".to_string())?
            };
            if !deleted && data.is_none() {
                return Err("Ván trong hàng đợi cloud không còn tồn tại.".to_string());
            }
            Ok(CloudPendingGameChange {
                document_id,
                generation,
                attempts,
                deleted,
                data,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok(CloudSyncBatch { profiles, games })
}

fn valid_cloud_document_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && !value.contains('/')
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_-".contains(character))
}

fn merge_cloud_changes_connection(
    connection: &mut Connection,
    request: MergeCloudChangesRequest,
) -> Result<CloudMergeResult, String> {
    if request.profiles.len() > 1_000 || request.games.len() > 10_000 {
        return Err("Bản đồng bộ vượt quá giới hạn an toàn.".to_string());
    }

    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể bắt đầu hợp nhất dữ liệu cloud.".to_string())?;
    let mut profiles_added = 0usize;
    let mut games_added = 0usize;
    let mut profiles_deleted = 0usize;
    let mut games_deleted = 0usize;

    for change in &request.profiles {
        if !valid_cloud_document_id(&change.document_id) {
            return Err("Mã hồ sơ cloud không hợp lệ.".to_string());
        }
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'profile' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận hồ sơ đã xoá trên cloud.".to_string())?;
            let profile_id: Option<i64> = transaction
                .query_row(
                    "SELECT id FROM player_profiles
                     WHERE platform || '_' || lower(username) = ?1",
                    params![&change.document_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|_| "Không thể tìm hồ sơ cần xoá từ cloud.".to_string())?;
            if let Some(profile_id) = profile_id {
                transaction
                    .execute(
                        "DELETE FROM game_profiles WHERE profile_id = ?1",
                        params![profile_id],
                    )
                    .map_err(|_| "Không thể xoá liên kết hồ sơ từ cloud.".to_string())?;
                profiles_deleted += transaction
                    .execute(
                        "DELETE FROM player_profiles WHERE id = ?1",
                        params![profile_id],
                    )
                    .map_err(|_| "Không thể xoá hồ sơ từ cloud.".to_string())?;
            }
            continue;
        }

        let profile = change
            .data
            .as_ref()
            .ok_or_else(|| "Hồ sơ cloud bị thiếu dữ liệu.".to_string())?;
        let platform = normalized_platform(Some(profile.platform.as_str()))
            .ok_or_else(|| "Nền tảng hồ sơ cloud không hợp lệ.".to_string())?;
        let username = profile.username.trim();
        if !valid_username(username) || profile_cloud_key(platform, username) != change.document_id
        {
            return Err("Username hoặc mã hồ sơ cloud không hợp lệ.".to_string());
        }
        if pending_cloud_operation(&transaction, "profile", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột hồ sơ local.".to_string())?
            .is_some()
        {
            continue;
        }
        profiles_added += transaction
            .execute(
                "INSERT OR IGNORE INTO player_profiles
                 (platform, username, last_sync_at, created_at)
                 VALUES (?1, ?2, ?3, COALESCE(NULLIF(?4, ''), datetime('now')))",
                params![
                    platform,
                    username,
                    &profile.last_sync_at,
                    &profile.created_at
                ],
            )
            .map_err(|_| "Không thể nhập hồ sơ từ cloud.".to_string())?;
        transaction
            .execute(
                "UPDATE player_profiles
                 SET last_sync_at = CASE
                   WHEN ?3 IS NOT NULL AND (last_sync_at IS NULL OR ?3 > last_sync_at) THEN ?3
                   ELSE last_sync_at
                 END
                 WHERE platform = ?1 AND username = ?2 COLLATE NOCASE",
                params![platform, username, &profile.last_sync_at],
            )
            .map_err(|_| "Không thể cập nhật hồ sơ từ cloud.".to_string())?;
        if change.needs_upgrade {
            queue_cloud_change(&transaction, "profile", &change.document_id, "upsert")
                .map_err(|_| "Không thể nâng cấp hồ sơ cloud cũ.".to_string())?;
        }
    }

    for change in &request.games {
        validate_game_id(&change.document_id)?;
        if change.deleted {
            transaction
                .execute(
                    "DELETE FROM cloud_sync_queue
                     WHERE entity_type = 'game' AND entity_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xác nhận ván đã xoá trên cloud.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM engine_analyses WHERE game_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá phân tích của ván từ cloud.".to_string())?;
            transaction
                .execute(
                    "DELETE FROM game_profiles WHERE game_id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá liên kết ván từ cloud.".to_string())?;
            games_deleted += transaction
                .execute(
                    "DELETE FROM saved_games WHERE id = ?1",
                    params![&change.document_id],
                )
                .map_err(|_| "Không thể xoá ván từ cloud.".to_string())?;
            continue;
        }

        let game = change
            .data
            .as_ref()
            .ok_or_else(|| "Ván cloud bị thiếu dữ liệu.".to_string())?;
        if game.id != change.document_id {
            return Err("Mã tài liệu cloud không khớp mã ván.".to_string());
        }
        validate_game_id(&game.id)?;
        let normalized_pgn = game.pgn.trim().replace("\r\n", "\n");
        if normalized_pgn.is_empty() || normalized_pgn.len() > 900_000 {
            return Err("PGN trên cloud không hợp lệ hoặc quá lớn.".to_string());
        }
        let mut hasher = Sha256::new();
        hasher.update(normalized_pgn.as_bytes());
        if format!("{:x}", hasher.finalize()) != game.id {
            return Err("Mã ván trên cloud không khớp nội dung PGN.".to_string());
        }
        if pending_cloud_operation(&transaction, "game", &change.document_id)
            .map_err(|_| "Không thể kiểm tra xung đột ván local.".to_string())?
            .is_some()
        {
            continue;
        }
        let source_platform = normalized_platform(game.source_platform.as_deref());
        let existed = transaction
            .query_row(
                "SELECT 1 FROM saved_games WHERE id = ?1",
                params![&game.id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|_| "Không thể kiểm tra ván local.".to_string())?
            .is_some();
        transaction
            .execute(
                "INSERT INTO saved_games
                 (id, pgn, white, black, white_elo, black_elo, result, event, game_date,
                  played_at, eco, opening, time_control, time_class, source_url,
                  source_platform, analysis_complete, created_at, last_opened_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                         ?14, ?15, ?16, 0, COALESCE(NULLIF(?17, ''), datetime('now')),
                         COALESCE(NULLIF(?18, ''), datetime('now')))
                 ON CONFLICT(id) DO UPDATE SET
                   pgn = excluded.pgn,
                   white = excluded.white,
                   black = excluded.black,
                   white_elo = excluded.white_elo,
                   black_elo = excluded.black_elo,
                   result = excluded.result,
                   event = excluded.event,
                   game_date = excluded.game_date,
                   played_at = excluded.played_at,
                   eco = excluded.eco,
                   opening = excluded.opening,
                   time_control = excluded.time_control,
                   time_class = excluded.time_class,
                   source_url = excluded.source_url,
                   source_platform = excluded.source_platform,
                   created_at = MIN(saved_games.created_at, excluded.created_at),
                   last_opened_at = MAX(saved_games.last_opened_at, excluded.last_opened_at)",
                params![
                    &game.id,
                    &normalized_pgn,
                    &game.white,
                    &game.black,
                    &game.white_elo,
                    &game.black_elo,
                    &game.result,
                    &game.event,
                    &game.date,
                    &game.played_at,
                    &game.eco,
                    &game.opening,
                    &game.time_control,
                    &game.time_class,
                    &game.source_url,
                    source_platform,
                    &game.created_at,
                    &game.last_opened_at,
                ],
            )
            .map_err(|_| "Không thể nhập ván từ cloud.".to_string())?;
        if !existed {
            games_added += 1;
        }
        transaction
            .execute(
                "DELETE FROM game_profiles WHERE game_id = ?1",
                params![&game.id],
            )
            .map_err(|_| "Không thể cập nhật liên kết ván cloud.".to_string())?;
        for profile_key in &game.profile_keys {
            let Some((platform_value, username_value)) = profile_key.split_once(':') else {
                continue;
            };
            let Some(platform) = normalized_platform(Some(platform_value)) else {
                continue;
            };
            if !valid_username(username_value) {
                continue;
            }
            transaction
                .execute(
                    "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
                     SELECT ?1, pp.id,
                            CASE WHEN lower(?2) = lower(?4) THEN 'w' ELSE 'b' END,
                            datetime('now')
                     FROM player_profiles pp
                     WHERE pp.platform = ?3 AND pp.username = ?2 COLLATE NOCASE
                       AND (lower(?2) = lower(?4) OR lower(?2) = lower(?5))",
                    params![&game.id, username_value, platform, &game.white, &game.black],
                )
                .map_err(|_| "Không thể liên kết ván cloud với hồ sơ.".to_string())?;
        }
        if game.profile_keys.is_empty() {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
                     SELECT ?1, pp.id,
                            CASE WHEN lower(?2) = lower(pp.username) THEN 'w' ELSE 'b' END,
                            datetime('now')
                     FROM player_profiles pp
                     WHERE (lower(?2) = lower(pp.username) OR lower(?3) = lower(pp.username))
                       AND (?4 IS NULL OR pp.platform = ?4)",
                    params![&game.id, &game.white, &game.black, source_platform],
                )
                .map_err(|_| "Không thể suy ra liên kết hồ sơ cho ván cloud cũ.".to_string())?;
        }
        if change.needs_upgrade {
            queue_cloud_change(&transaction, "game", &change.document_id, "upsert")
                .map_err(|_| "Không thể nâng cấp ván cloud cũ.".to_string())?;
        }
    }

    transaction
        .commit()
        .map_err(|_| "Không thể lưu dữ liệu cloud đã hợp nhất.".to_string())?;
    Ok(CloudMergeResult {
        profiles_added,
        games_added,
        profiles_deleted,
        games_deleted,
    })
}

#[tauri::command]
fn merge_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
    request: MergeCloudChangesRequest,
) -> Result<CloudMergeResult, String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở dữ liệu để hợp nhất.".to_string())?;
    merge_cloud_changes_connection(&mut connection, request)
}

fn load_cloud_cursor(
    connection: &Connection,
    uid: &str,
    collection: &str,
) -> rusqlite::Result<CloudSyncCursor> {
    connection
        .query_row(
            "SELECT initialized, updated_at_seconds, updated_at_nanoseconds, document_id
             FROM cloud_sync_cursors
             WHERE uid = ?1 AND collection_name = ?2",
            params![uid, collection],
            |row| {
                Ok(CloudSyncCursor {
                    initialized: row.get::<_, i64>(0)? != 0,
                    updated_at_seconds: row.get(1)?,
                    updated_at_nanoseconds: row.get(2)?,
                    document_id: row.get(3)?,
                })
            },
        )
        .optional()
        .map(|cursor| cursor.unwrap_or_default())
}

#[tauri::command]
fn get_cloud_sync_cursors(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
) -> Result<CloudSyncCursors, String> {
    if uid.trim().is_empty() || uid.len() > 128 {
        return Err("Firebase UID không hợp lệ.".to_string());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở trạng thái đồng bộ.".to_string())?;
    Ok(CloudSyncCursors {
        profiles: load_cloud_cursor(&connection, &uid, "profiles")
            .map_err(|_| "Không thể đọc con trỏ hồ sơ cloud.".to_string())?,
        games: load_cloud_cursor(&connection, &uid, "games")
            .map_err(|_| "Không thể đọc con trỏ ván cloud.".to_string())?,
    })
}

fn save_cloud_cursor(
    connection: &Connection,
    uid: &str,
    collection: &str,
    cursor: &CloudSyncCursor,
) -> rusqlite::Result<()> {
    connection.execute(
        "INSERT INTO cloud_sync_cursors
         (uid, collection_name, initialized, updated_at_seconds, updated_at_nanoseconds, document_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(uid, collection_name) DO UPDATE SET
           initialized = excluded.initialized,
           updated_at_seconds = excluded.updated_at_seconds,
           updated_at_nanoseconds = excluded.updated_at_nanoseconds,
           document_id = excluded.document_id",
        params![
            uid,
            collection,
            i64::from(cursor.initialized),
            cursor.updated_at_seconds,
            cursor.updated_at_nanoseconds,
            cursor.document_id,
        ],
    )?;
    Ok(())
}

#[tauri::command]
fn set_cloud_sync_cursors(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
    cursors: CloudSyncCursors,
) -> Result<(), String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở trạng thái đồng bộ.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể lưu con trỏ đồng bộ.".to_string())?;
    save_cloud_cursor(&transaction, &uid, "profiles", &cursors.profiles)
        .map_err(|_| "Không thể lưu con trỏ hồ sơ cloud.".to_string())?;
    save_cloud_cursor(&transaction, &uid, "games", &cursors.games)
        .map_err(|_| "Không thể lưu con trỏ ván cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất lưu con trỏ cloud.".to_string())
}

fn acknowledge_cloud_changes_connection(
    connection: &mut Connection,
    changes: Vec<CloudAckToken>,
) -> Result<usize, String> {
    let transaction = connection
        .transaction()
        .map_err(|_| "Không thể xác nhận hàng đợi cloud.".to_string())?;
    for change in changes {
        if !matches!(change.entity_type.as_str(), "profile" | "game") {
            return Err("Loại thay đổi cloud không hợp lệ.".to_string());
        }
        transaction
            .execute(
                "DELETE FROM cloud_sync_queue
                 WHERE entity_type = ?1 AND entity_id = ?2 AND generation = ?3",
                params![change.entity_type, change.entity_id, change.generation],
            )
            .map_err(|_| "Không thể xác nhận thay đổi đã tải lên.".to_string())?;
    }
    let remaining: i64 = transaction
        .query_row("SELECT COUNT(*) FROM cloud_sync_queue", [], |row| {
            row.get(0)
        })
        .map_err(|_| "Không thể đếm hàng đợi cloud.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Không thể hoàn tất xác nhận cloud.".to_string())?;
    Ok(remaining.max(0) as usize)
}

#[tauri::command]
fn acknowledge_cloud_changes(
    database: tauri::State<'_, DatabaseState>,
    changes: Vec<CloudAckToken>,
) -> Result<usize, String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở hàng đợi cloud.".to_string())?;
    acknowledge_cloud_changes_connection(&mut connection, changes)
}

fn mark_cloud_changes_failed_connection(
    connection: &Connection,
    changes: Vec<CloudAckToken>,
    error: String,
) -> Result<(), String> {
    let message: String = error.chars().take(500).collect();
    for change in changes {
        connection
            .execute(
                "UPDATE cloud_sync_queue
                 SET attempts = attempts + 1,
                     next_retry_at = datetime('now', '+' || MIN(300, (attempts + 1) * (attempts + 1) * 2) || ' seconds'),
                     last_error = ?4
                 WHERE entity_type = ?1 AND entity_id = ?2 AND generation = ?3",
                params![
                    change.entity_type,
                    change.entity_id,
                    change.generation,
                    &message
                ],
            )
            .map_err(|_| "Không thể lưu trạng thái retry cloud.".to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn mark_cloud_changes_failed(
    database: tauri::State<'_, DatabaseState>,
    changes: Vec<CloudAckToken>,
    error: String,
) -> Result<(), String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở hàng đợi cloud.".to_string())?;
    mark_cloud_changes_failed_connection(&connection, changes, error)
}

fn valid_username(username: &str) -> bool {
    !username.is_empty()
        && username.len() <= 40
        && username
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_-".contains(character))
}

fn normalized_time_class(value: Option<&str>) -> Option<&str> {
    match value {
        Some("bullet") => Some("bullet"),
        Some("blitz") => Some("blitz"),
        Some("rapid") => Some("rapid"),
        Some("classical") => Some("classical"),
        _ => None,
    }
}

fn split_multi_pgn(raw: &str) -> Vec<String> {
    let normalized = raw.replace("\r\n", "\n");
    normalized
        .split("\n\n[Event ")
        .enumerate()
        .filter_map(|(index, part)| {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                return None;
            }
            Some(if index == 0 {
                trimmed.to_string()
            } else {
                format!("[Event {trimmed}")
            })
        })
        .collect()
}

async fn fetch_recent_chess_com_games(
    client: &Client,
    username: &str,
    limit: usize,
    time_class: Option<&str>,
) -> Result<Vec<String>, String> {
    let archives_url = format!("https://api.chess.com/pub/player/{username}/games/archives");
    let response = client
        .get(archives_url)
        .send()
        .await
        .map_err(|_| "Không kết nối được với Chess.com.".to_string())?;
    if response.status().as_u16() == 404 {
        return Err("Không tìm thấy tài khoản Chess.com này.".to_string());
    }
    if !response.status().is_success() {
        return Err("Chess.com chưa trả về kho ván. Hãy thử lại sau.".to_string());
    }
    let archives: Value = response
        .json()
        .await
        .map_err(|_| "Danh sách kho ván Chess.com không hợp lệ.".to_string())?;
    let archive_urls = archives
        .get("archives")
        .and_then(Value::as_array)
        .ok_or_else(|| "Tài khoản chưa có kho ván công khai.".to_string())?;
    let mut games: Vec<(i64, String)> = Vec::new();
    for archive in archive_urls.iter().rev() {
        let Some(url) = archive.as_str() else {
            continue;
        };
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|_| "Không tải được một tháng ván Chess.com.".to_string())?;
        if !response.status().is_success() {
            continue;
        }
        let month: Value = response
            .json()
            .await
            .map_err(|_| "Dữ liệu tháng Chess.com không hợp lệ.".to_string())?;
        if let Some(items) = month.get("games").and_then(Value::as_array) {
            for game in items {
                if text_field(game, "rules").unwrap_or("chess") != "chess" {
                    continue;
                }
                if let Some(filter) = time_class {
                    if text_field(game, "time_class") != Some(filter) {
                        continue;
                    }
                }
                if let Some(pgn) = text_field(game, "pgn") {
                    games.push((
                        game.get("end_time").and_then(Value::as_i64).unwrap_or(0),
                        pgn.to_string(),
                    ));
                }
            }
        }
        if games.len() >= limit {
            break;
        }
    }
    games.sort_by(|left, right| right.0.cmp(&left.0));
    Ok(games.into_iter().take(limit).map(|(_, pgn)| pgn).collect())
}

async fn fetch_recent_lichess_games(
    client: &Client,
    username: &str,
    limit: usize,
    time_class: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut url = Url::parse(&format!("https://lichess.org/api/games/user/{username}"))
        .map_err(|_| "Không thể tạo đường dẫn Lichess.".to_string())?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("max", &limit.to_string());
        query.append_pair("moves", "true");
        query.append_pair("clocks", "true");
        query.append_pair("opening", "true");
        query.append_pair("sort", "dateDesc");
        if let Some(filter) = time_class {
            query.append_pair("perfType", filter);
        }
    }
    let response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/x-chess-pgn")
        .send()
        .await
        .map_err(|_| "Không kết nối được với Lichess.".to_string())?;
    if response.status().as_u16() == 404 {
        return Err("Không tìm thấy tài khoản Lichess này.".to_string());
    }
    if !response.status().is_success() {
        return Err("Lichess chưa trả về danh sách ván. Hãy thử lại sau.".to_string());
    }
    let text = response
        .text()
        .await
        .map_err(|_| "Không đọc được PGN từ Lichess.".to_string())?;
    Ok(split_multi_pgn(&text).into_iter().take(limit).collect())
}

#[tauri::command]
async fn fetch_recent_games(request: FetchRecentGamesRequest) -> Result<Vec<String>, String> {
    let username = request.username.trim().to_ascii_lowercase();
    if !valid_username(&username) {
        return Err("Username chỉ được chứa chữ, số, gạch ngang hoặc gạch dưới.".to_string());
    }
    let limit = request.limit.clamp(1, 100);
    let time_class = normalized_time_class(request.time_class.as_deref());
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("ChessCoachVN/0.5.0 (local desktop app)")
        .build()
        .map_err(|_| "Không thể khởi tạo kết nối mạng.".to_string())?;
    match request.platform.as_str() {
        "chesscom" => fetch_recent_chess_com_games(&client, &username, limit, time_class).await,
        "lichess" => fetch_recent_lichess_games(&client, &username, limit, time_class).await,
        _ => Err("Nền tảng đồng bộ không hợp lệ.".to_string()),
    }
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
    expected_generation: u64,
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
    if connection.generation != expected_generation {
        return Ok(());
    }
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

const COACH_SECTION_LABELS: [&str; 4] = ["ĐÁNH GIÁ", "Ý TƯỞNG", "SO SÁNH", "KẾ HOẠCH"];

fn replace_internal_coach_fields(text: &str, request: &ExplainMoveRequest) -> String {
    let best_move_phrase = format!("nước tốt nhất {}", request.best_move);
    let best_reply_phrase = request
        .best_reply
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("nước đáp tốt nhất {value}"))
        .unwrap_or_else(|| "nước đáp tốt nhất".to_string());
    let moved_side_phrase = format!("bên {} vừa đi", request.side_just_moved);
    let next_side_phrase = format!("bên {} tới lượt", request.side_to_move);

    [
        ("nước nuoc_tot_nhat", best_move_phrase.as_str()),
        ("nuoc_tot_nhat", best_move_phrase.as_str()),
        ("nước nuoc_dap_tot_nhat", best_reply_phrase.as_str()),
        ("nuoc_dap_tot_nhat", best_reply_phrase.as_str()),
        ("bên ben_vua_di", moved_side_phrase.as_str()),
        ("ben_vua_di", moved_side_phrase.as_str()),
        ("bên ben_toi_luot", next_side_phrase.as_str()),
        ("ben_toi_luot", next_side_phrase.as_str()),
    ]
    .into_iter()
    .fold(text.to_string(), |result, (field, phrase)| {
        result.replace(field, phrase)
    })
}

fn coach_section_fallbacks(request: &ExplainMoveRequest) -> [String; 4] {
    let main_line = if request.best_line.is_empty() {
        request.best_move.clone()
    } else {
        request.best_line.join(" ")
    };
    let plan = request
        .best_reply
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            format!(
                "Bên {} nên ưu tiên nước đáp tốt nhất {value}.",
                request.side_to_move
            )
        })
        .unwrap_or_else(|| "Ván đấu đã kết thúc, không còn nước đáp hợp lệ.".to_string());

    [
        format!(
            "Nước {} có đánh giá {} và mất {} centipawn.",
            request.played_move, request.evaluation, request.centipawn_loss
        ),
        format!("Biến chính {main_line} cho thấy kế hoạch cụ thể cần ưu tiên trong vị trí này."),
        format!(
            "Stockfish chọn nước tốt nhất {} thay cho nước đã đi.",
            request.best_move
        ),
        plan,
    ]
}

fn normalize_coach_explanation(text: &str, request: &ExplainMoveRequest) -> String {
    let without_markdown = text.replace("**", "").replace("__", "").replace('`', "");
    let expanded_fields = replace_internal_coach_fields(&without_markdown, request);
    let expanded_labels = COACH_SECTION_LABELS
        .iter()
        .fold(expanded_fields, |result, label| {
            result.replace(label, &format!("\n{label}"))
        });
    let mut sections = [String::new(), String::new(), String::new(), String::new()];
    let mut current_section: Option<usize> = None;
    let mut unassigned = Vec::new();

    for raw_line in expanded_labels.lines() {
        let line = raw_line.trim().trim_matches(|character: char| {
            character.is_whitespace() || matches!(character, '*' | '_' | '#' | '`')
        });
        if line.is_empty() {
            continue;
        }

        let labeled = COACH_SECTION_LABELS
            .iter()
            .enumerate()
            .find(|(_, label)| line.starts_with(**label));
        if let Some((index, label)) = labeled {
            current_section = Some(index);
            let content = line[label.len()..].trim_start_matches(|character: char| {
                character.is_whitespace() || matches!(character, ':' | '·' | '|' | '-')
            });
            if !content.is_empty() {
                sections[index].push_str(content);
            }
            continue;
        }

        if let Some(index) = current_section {
            if !sections[index].is_empty() {
                sections[index].push(' ');
            }
            sections[index].push_str(line);
        } else {
            unassigned.push(line.to_string());
        }
    }

    for content in unassigned {
        if let Some(section) = sections.iter_mut().find(|section| section.is_empty()) {
            *section = content;
        }
    }

    let fallbacks = coach_section_fallbacks(request);
    COACH_SECTION_LABELS
        .iter()
        .enumerate()
        .map(|(index, label)| {
            let content = if sections[index].trim().is_empty() {
                &fallbacks[index]
            } else {
                sections[index].trim()
            };
            format!("{label}: {content}")
        })
        .collect::<Vec<_>>()
        .join("\n")
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
    let database_generation = database
        .0
        .lock()
        .map_err(|_| "Không thể đọc phiên kho dữ liệu.".to_string())?
        .generation;
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
    let raw_text = if provider == "gemini" {
        request_gemini(&client, &key, &model, COACH_PROMPT, &input, 250).await?
    } else {
        request_openai(&client, &key, &model, COACH_PROMPT, &input, 250).await?
    };
    let text = normalize_coach_explanation(&raw_text, &request);
    write_cached_explanation(
        &database,
        database_generation,
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
    let database_generation = database
        .0
        .lock()
        .map_err(|_| "Không thể đọc phiên kho dữ liệu.".to_string())?
        .generation;
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
        database_generation,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn cloud_test_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(
                "CREATE TABLE saved_games (
                    id TEXT PRIMARY KEY,
                    pgn TEXT NOT NULL,
                    white TEXT NOT NULL,
                    black TEXT NOT NULL,
                    white_elo TEXT,
                    black_elo TEXT,
                    result TEXT,
                    event TEXT,
                    game_date TEXT,
                    played_at TEXT,
                    eco TEXT,
                    opening TEXT,
                    time_control TEXT,
                    time_class TEXT,
                    source_url TEXT,
                    source_platform TEXT,
                    analysis_complete INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL
                );
                CREATE TABLE player_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    username TEXT NOT NULL,
                    last_sync_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX idx_test_profiles_identity
                ON player_profiles(platform, username COLLATE NOCASE);
                CREATE TABLE game_profiles (
                    game_id TEXT NOT NULL,
                    profile_id INTEGER NOT NULL,
                    player_color TEXT NOT NULL,
                    linked_at TEXT NOT NULL,
                    PRIMARY KEY(game_id, profile_id)
                );
                CREATE TABLE engine_analyses (
                    game_id TEXT NOT NULL
                );
                CREATE TABLE cloud_sync_queue (
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    generation INTEGER NOT NULL DEFAULT 1,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_retry_at TEXT,
                    last_error TEXT,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(entity_type, entity_id)
                );",
            )
            .expect("create cloud test schema");
        connection
    }

    fn cloud_game(pgn: &str) -> CloudSavedGame {
        let normalized_pgn = pgn.trim().replace("\r\n", "\n");
        let mut hasher = Sha256::new();
        hasher.update(normalized_pgn.as_bytes());
        CloudSavedGame {
            id: format!("{:x}", hasher.finalize()),
            pgn: normalized_pgn,
            white: "White".to_string(),
            black: "Black".to_string(),
            white_elo: None,
            black_elo: None,
            result: Some("1-0".to_string()),
            event: Some("Test".to_string()),
            date: None,
            played_at: None,
            eco: None,
            opening: None,
            time_control: None,
            time_class: None,
            source_url: None,
            source_platform: None,
            created_at: "2026-07-23 10:00:00".to_string(),
            last_opened_at: "2026-07-23 10:00:00".to_string(),
            profile_keys: Vec::new(),
        }
    }

    #[test]
    fn account_databases_are_isolated_and_legacy_is_claimed_once() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let data_dir = std::env::temp_dir().join(format!(
            "chess-coach-account-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&data_dir).unwrap();
        let guest = Connection::open(data_dir.join("ky-pho.sqlite3")).unwrap();
        initialize_database(&guest, true).unwrap();
        let guest_profiles: i64 = guest
            .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
            .unwrap();
        assert!(guest_profiles > 0);
        let mut active = ActiveDatabase {
            connection: guest,
            data_dir: data_dir.clone(),
            active_uid: None,
            generation: 0,
        };

        let first = activate_cloud_account_connection(&mut active, "firebase-user-a").unwrap();
        assert!(first.changed);
        assert!(first.claimed_legacy_data);
        let account_a_profiles: i64 = active
            .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(account_a_profiles, guest_profiles);

        let second = activate_cloud_account_connection(&mut active, "firebase-user-b").unwrap();
        assert!(second.changed);
        assert!(!second.claimed_legacy_data);
        let account_b_profiles: i64 = active
            .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(account_b_profiles, 0);

        let reopened = activate_cloud_account_connection(&mut active, "firebase-user-a").unwrap();
        assert!(reopened.changed);
        assert!(!reopened.claimed_legacy_data);
        let reopened_profiles: i64 = active
            .query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(reopened_profiles, guest_profiles);

        drop(active);
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn ambiguous_legacy_account_history_is_not_migrated_automatically() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let data_dir = std::env::temp_dir().join(format!(
            "chess-coach-account-ambiguity-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&data_dir).unwrap();
        let guest = Connection::open(data_dir.join("ky-pho.sqlite3")).unwrap();
        initialize_database(&guest, true).unwrap();
        for uid in ["firebase-user-a", "firebase-user-b"] {
            guest
                .execute(
                    "INSERT INTO cloud_sync_cursors
                     (uid, collection_name, initialized)
                     VALUES (?1, 'games', 1)",
                    params![uid],
                )
                .unwrap();
        }
        let mut active = ActiveDatabase {
            connection: guest,
            data_dir: data_dir.clone(),
            active_uid: None,
            generation: 0,
        };

        let error = activate_cloud_account_connection(&mut active, "firebase-user-a")
            .err()
            .expect("ambiguous history must be rejected");
        assert!(error.contains("nhiều tài khoản Firebase"));

        drop(active);
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn cloud_queue_keeps_new_generation_for_retries() {
        let mut connection = cloud_test_connection();
        queue_cloud_change(&connection, "game", "game-1", "upsert").unwrap();
        connection
            .execute(
                "UPDATE cloud_sync_queue
                 SET attempts = 3, last_error = 'offline'
                 WHERE entity_type = 'game' AND entity_id = 'game-1'",
                [],
            )
            .unwrap();
        queue_cloud_change(&connection, "game", "game-1", "delete").unwrap();
        let remaining = acknowledge_cloud_changes_connection(
            &mut connection,
            vec![CloudAckToken {
                entity_type: "game".to_string(),
                entity_id: "game-1".to_string(),
                generation: 1,
            }],
        )
        .unwrap();

        let state: (String, i64, i64, Option<String>) = connection
            .query_row(
                "SELECT operation, generation, attempts, last_error
                 FROM cloud_sync_queue
                 WHERE entity_type = 'game' AND entity_id = 'game-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(remaining, 1);
        assert_eq!(state, ("delete".to_string(), 2, 0, None));
    }

    #[test]
    fn failed_cloud_change_persists_retry_state() {
        let connection = cloud_test_connection();
        queue_cloud_change(&connection, "profile", "lichess_player", "upsert").unwrap();
        mark_cloud_changes_failed_connection(
            &connection,
            vec![CloudAckToken {
                entity_type: "profile".to_string(),
                entity_id: "lichess_player".to_string(),
                generation: 1,
            }],
            "offline".to_string(),
        )
        .unwrap();

        let state: (i64, Option<String>, Option<String>) = connection
            .query_row(
                "SELECT attempts, next_retry_at, last_error
                 FROM cloud_sync_queue
                 WHERE entity_type = 'profile' AND entity_id = 'lichess_player'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(state.0, 1);
        assert!(state.1.is_some());
        assert_eq!(state.2.as_deref(), Some("offline"));
    }

    #[test]
    fn remote_tombstone_removes_local_game_and_pending_upload() {
        let mut connection = cloud_test_connection();
        let game = cloud_game("[Event \"Test\"]\n\n1. e4 e5 1-0");
        connection
            .execute(
                "INSERT INTO saved_games
                 (id, pgn, white, black, created_at, last_opened_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &game.id,
                    &game.pgn,
                    &game.white,
                    &game.black,
                    &game.created_at,
                    &game.last_opened_at
                ],
            )
            .unwrap();
        queue_cloud_change(&connection, "game", &game.id, "upsert").unwrap();

        let result = merge_cloud_changes_connection(
            &mut connection,
            MergeCloudChangesRequest {
                profiles: Vec::new(),
                games: vec![CloudRemoteGameChange {
                    document_id: game.id.clone(),
                    deleted: true,
                    needs_upgrade: false,
                    data: None,
                }],
            },
        )
        .unwrap();

        assert_eq!(result.games_deleted, 1);
        let saved: i64 = connection
            .query_row("SELECT COUNT(*) FROM saved_games", [], |row| row.get(0))
            .unwrap();
        let pending: i64 = connection
            .query_row("SELECT COUNT(*) FROM cloud_sync_queue", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(saved, 0);
        assert_eq!(pending, 0);
    }

    #[test]
    fn local_delete_wins_over_remote_upsert() {
        let mut connection = cloud_test_connection();
        let game = cloud_game("[Event \"Test\"]\n\n1. d4 d5 1-0");
        queue_cloud_change(&connection, "game", &game.id, "delete").unwrap();

        merge_cloud_changes_connection(
            &mut connection,
            MergeCloudChangesRequest {
                profiles: Vec::new(),
                games: vec![CloudRemoteGameChange {
                    document_id: game.id.clone(),
                    deleted: false,
                    needs_upgrade: false,
                    data: Some(game),
                }],
            },
        )
        .unwrap();

        let saved: i64 = connection
            .query_row("SELECT COUNT(*) FROM saved_games", [], |row| row.get(0))
            .unwrap();
        let operation: String = connection
            .query_row(
                "SELECT operation FROM cloud_sync_queue WHERE entity_type = 'game'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(saved, 0);
        assert_eq!(operation, "delete");
    }

    #[test]
    fn splits_lichess_multi_pgn_without_losing_event_headers() {
        let games = split_multi_pgn(
            "[Event \"Game 1\"]\n[Result \"1-0\"]\n\n1. e4 e5 1-0\n\n[Event \"Game 2\"]\n[Result \"0-1\"]\n\n1. d4 d5 0-1",
        );
        assert_eq!(games.len(), 2);
        assert!(games[0].starts_with("[Event \"Game 1\"]"));
        assert!(games[1].starts_with("[Event \"Game 2\"]"));
    }

    #[test]
    fn validates_public_chess_usernames_and_filters() {
        assert!(valid_username("Cuongkool"));
        assert!(valid_username("player-name_2"));
        assert!(!valid_username("player/name"));
        assert_eq!(normalized_time_class(Some("rapid")), Some("rapid"));
        assert_eq!(normalized_time_class(Some("unknown")), None);
    }

    #[test]
    fn extracts_played_timestamp_from_pgn_headers() {
        let pgn =
            "[Event \"Live Chess\"]\n[UTCDate \"2026.07.22\"]\n[UTCTime \"09:08:07\"]\n\n1. e4 e5";
        assert_eq!(
            played_at_from_pgn(pgn),
            Some("2026-07-22 09:08:07".to_string())
        );
        assert_eq!(
            played_at_from_pgn("[Date \"2026.07.21\"]\n\n1. d4 d5"),
            Some("2026-07-21".to_string())
        );
    }

    fn coach_request() -> ExplainMoveRequest {
        ExplainMoveRequest {
            player_elo: Some("1200".to_string()),
            side_just_moved: "Trắng".to_string(),
            side_to_move: "Đen".to_string(),
            phase: "Khai cuộc".to_string(),
            move_number: 6,
            played_move: "Bd7".to_string(),
            fen_before: "before".to_string(),
            fen_after: "after".to_string(),
            evaluation: "+1.34".to_string(),
            centipawn_loss: 54,
            best_move: "e6".to_string(),
            best_line: vec!["e6".to_string(), "h3".to_string()],
            best_reply: Some("h3".to_string()),
            reply_line: vec!["h3".to_string()],
        }
    }

    #[test]
    fn normalizes_standalone_markdown_labels_and_internal_fields() {
        let normalized = normalize_coach_explanation(
            "**SO SÁNH**\nNước này trùng khớp hoàn toàn với nuoc_tot_nhat.",
            &coach_request(),
        );

        assert_eq!(normalized.lines().count(), 4);
        assert!(normalized.contains("SO SÁNH: Nước này trùng khớp hoàn toàn với nước tốt nhất e6."));
        assert!(!normalized.contains("nuoc_tot_nhat"));
        assert!(!normalized.contains("**"));
    }

    #[test]
    fn keeps_each_section_on_one_canonical_line() {
        let normalized = normalize_coach_explanation(
            "**ĐÁNH GIÁ**\nBd7 mất 54 centipawn.\n**Ý TƯỞNG**\nTượng phát triển.\n**SO SÁNH**\ne6 linh hoạt hơn.\n**KẾ HOẠCH**\nben_toi_luot nên chơi nuoc_dap_tot_nhat.",
            &coach_request(),
        );
        let lines = normalized.lines().collect::<Vec<_>>();

        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0], "ĐÁNH GIÁ: Bd7 mất 54 centipawn.");
        assert_eq!(lines[1], "Ý TƯỞNG: Tượng phát triển.");
        assert_eq!(lines[2], "SO SÁNH: e6 linh hoạt hơn.");
        assert_eq!(
            lines[3],
            "KẾ HOẠCH: bên Đen tới lượt nên chơi nước đáp tốt nhất h3."
        );
    }
}

fn open_system_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("rundll32.exe");
        command.args(["url.dll,FileProtocolHandler", url]);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Không thể mở trình duyệt mặc định: {error}"))
}

fn loopback_response(
    stream: &mut std::net::TcpStream,
    status: &str,
    body: &str,
) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nPragma: no-cache\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("Không thể trả phản hồi OAuth: {error}"))
}

fn run_google_oauth_loopback() -> Result<String, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Không thể mở cổng đăng nhập cục bộ: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Không thể cấu hình cổng đăng nhập: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Không thể đọc cổng đăng nhập: {error}"))?
        .port();

    let mut random_state = [0_u8; 32];
    getrandom::fill(&mut random_state)
        .map_err(|error| format!("Không thể tạo mã bảo vệ đăng nhập: {error}"))?;
    let state = random_state
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let callback = format!("http://127.0.0.1:{port}/oauth/callback");
    let mut bridge_url = Url::parse("https://chess-coach-4b50e.firebaseapp.com/auth-bridge.html")
        .map_err(|error| format!("URL đăng nhập không hợp lệ: {error}"))?;
    bridge_url
        .query_pairs_mut()
        .append_pair("callback", &callback)
        .append_pair("state", &state);
    open_system_browser(bridge_url.as_str())?;

    let deadline = Instant::now() + Duration::from_secs(300);
    while Instant::now() < deadline {
        let (mut stream, _) = match listener.accept() {
            Ok(connection) => connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(error) => return Err(format!("Không thể nhận kết quả đăng nhập: {error}")),
        };
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut request = Vec::with_capacity(4096);
        let mut chunk = [0_u8; 2048];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(count) => {
                    request.extend_from_slice(&chunk[..count]);
                    if request.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                    if request.len() > 16_384 {
                        return Err("Phản hồi đăng nhập vượt quá giới hạn an toàn.".into());
                    }
                }
                Err(error)
                    if error.kind() == std::io::ErrorKind::WouldBlock
                        || error.kind() == std::io::ErrorKind::TimedOut =>
                {
                    break;
                }
                Err(error) => return Err(format!("Không thể đọc kết quả đăng nhập: {error}")),
            }
        }

        let request_text = String::from_utf8_lossy(&request);
        let Some(target) = request_text
            .lines()
            .next()
            .and_then(|line| line.strip_prefix("GET "))
            .and_then(|line| line.split_whitespace().next())
        else {
            let _ = loopback_response(&mut stream, "400 Bad Request", "Yêu cầu không hợp lệ.");
            continue;
        };
        let parsed = match Url::parse(&format!("http://127.0.0.1:{port}{target}")) {
            Ok(url) if url.path() == "/oauth/callback" => url,
            _ => {
                let _ = loopback_response(&mut stream, "404 Not Found", "Không tìm thấy.");
                continue;
            }
        };
        let values = parsed
            .query_pairs()
            .collect::<std::collections::HashMap<_, _>>();
        if values.get("state").map(|value| value.as_ref()) != Some(state.as_str()) {
            let _ = loopback_response(
                &mut stream,
                "403 Forbidden",
                "Mã bảo vệ đăng nhập không khớp.",
            );
            continue;
        }
        if let Some(error) = values.get("error") {
            let message = values
                .get("error_description")
                .map(|value| value.to_string())
                .unwrap_or_else(|| error.to_string());
            let _ = loopback_response(
                &mut stream,
                "200 OK",
                "Đăng nhập đã được hủy. Bạn có thể đóng tab này.",
            );
            return Err(message);
        }
        let Some(access_token) = values.get("access_token").map(|value| value.to_string()) else {
            let _ = loopback_response(&mut stream, "400 Bad Request", "Thiếu token đăng nhập.");
            continue;
        };
        if access_token.len() > 12_000 {
            return Err("Token đăng nhập vượt quá giới hạn an toàn.".into());
        }

        let success_page = r#"<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Đăng nhập thành công</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1411;color:#dce9e2;font:16px system-ui}.card{max-width:420px;padding:32px;border:1px solid #29483b;border-radius:16px;background:#111e19;text-align:center}h1{color:#70e1b5;font-size:22px}p{color:#92a69c;line-height:1.6}</style></head><body><main class="card"><h1>Đăng nhập thành công</h1><p>Bạn có thể đóng tab này và quay lại Chess Coach.</p></main><script>history.replaceState(null,'','/done');setTimeout(()=>window.close(),700)</script></body></html>"#;
        loopback_response(&mut stream, "200 OK", success_page)?;
        return Ok(access_token);
    }

    Err("Đăng nhập quá thời gian. Hãy thử lại.".into())
}

#[tauri::command]
async fn begin_google_oauth() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(run_google_oauth_loopback)
        .await
        .map_err(|error| format!("Luồng đăng nhập bị gián đoạn: {error}"))?
}

fn initialize_database(
    connection: &Connection,
    seed_default_profiles: bool,
) -> rusqlite::Result<()> {
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
            played_at TEXT,
            eco TEXT,
            opening TEXT,
            time_control TEXT,
            time_class TEXT,
            source_url TEXT,
            source_platform TEXT,
            analysis_complete INTEGER NOT NULL DEFAULT 0,
            analyzed_at TEXT,
            created_at TEXT NOT NULL,
            last_opened_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_saved_games_last_opened
        ON saved_games(last_opened_at DESC);
        CREATE TABLE IF NOT EXISTS engine_analyses (
            game_id TEXT NOT NULL,
            ply INTEGER NOT NULL,
            engine_version TEXT NOT NULL,
            depth INTEGER NOT NULL,
            result_json TEXT NOT NULL,
            color TEXT NOT NULL,
            phase TEXT NOT NULL,
            quality TEXT NOT NULL,
            centipawn_loss REAL NOT NULL,
            think_time_seconds REAL,
            is_quick INTEGER NOT NULL DEFAULT 0,
            is_time_pressure INTEGER NOT NULL DEFAULT 0,
            tags_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL,
            PRIMARY KEY(game_id, ply, engine_version)
        );
        CREATE INDEX IF NOT EXISTS idx_engine_analyses_game
        ON engine_analyses(game_id, engine_version, ply);
        CREATE TABLE IF NOT EXISTS player_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            username TEXT NOT NULL,
            last_sync_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profiles_identity
        ON player_profiles(platform, username COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS game_profiles (
            game_id TEXT NOT NULL,
            profile_id INTEGER NOT NULL,
            player_color TEXT NOT NULL,
            linked_at TEXT NOT NULL,
            PRIMARY KEY(game_id, profile_id)
        );
        CREATE INDEX IF NOT EXISTS idx_game_profiles_profile
        ON game_profiles(profile_id, game_id);
        CREATE TABLE IF NOT EXISTS cloud_sync_queue (
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            generation INTEGER NOT NULL DEFAULT 1,
            attempts INTEGER NOT NULL DEFAULT 0,
            next_retry_at TEXT,
            last_error TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_sync_queue_retry
        ON cloud_sync_queue(next_retry_at, updated_at);
        CREATE TABLE IF NOT EXISTS cloud_sync_cursors (
            uid TEXT NOT NULL,
            collection_name TEXT NOT NULL,
            initialized INTEGER NOT NULL DEFAULT 0,
            updated_at_seconds INTEGER,
            updated_at_nanoseconds INTEGER,
            document_id TEXT,
            PRIMARY KEY(uid, collection_name)
        );
        CREATE TABLE IF NOT EXISTS app_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )?;
    for migration in [
        "ALTER TABLE saved_games ADD COLUMN opening TEXT",
        "ALTER TABLE saved_games ADD COLUMN time_class TEXT",
        "ALTER TABLE saved_games ADD COLUMN analysis_complete INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE saved_games ADD COLUMN analyzed_at TEXT",
        "ALTER TABLE saved_games ADD COLUMN source_platform TEXT",
        "ALTER TABLE saved_games ADD COLUMN played_at TEXT",
    ] {
        let _ = connection.execute(migration, []);
    }
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_saved_games_played_at ON saved_games(played_at DESC)",
        [],
    )?;
    backfill_played_at(connection)?;
    connection.execute(
        "UPDATE saved_games
         SET source_platform = CASE
           WHEN source_url LIKE '%lichess.org%' THEN 'lichess'
           WHEN source_url LIKE '%chess.com%' THEN 'chesscom'
           ELSE source_platform
         END
         WHERE source_platform IS NULL",
        [],
    )?;
    let profile_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM player_profiles", [], |row| row.get(0))?;
    if seed_default_profiles && profile_count == 0 {
        connection.execute(
            "INSERT INTO player_profiles (platform, username, created_at)
             VALUES ('chesscom', 'Cuongkool', datetime('now'))",
            [],
        )?;
        connection.execute(
            "INSERT INTO player_profiles (platform, username, created_at)
             VALUES ('lichess', 'chinsu1409', datetime('now'))",
            [],
        )?;
    }
    connection.execute(
        "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
         SELECT sg.id, pp.id,
                CASE WHEN lower(sg.white) = lower(pp.username) THEN 'w' ELSE 'b' END,
                datetime('now')
         FROM saved_games sg
         JOIN player_profiles pp
           ON lower(sg.white) = lower(pp.username) OR lower(sg.black) = lower(pp.username)
         WHERE sg.source_platform IS NULL OR sg.source_platform = pp.platform",
        [],
    )?;
    let cloud_queue_initialized: Option<String> = connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'cloud_sync_queue_initialized'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if cloud_queue_initialized.is_none() {
        connection.execute(
            "INSERT OR IGNORE INTO cloud_sync_queue
             (entity_type, entity_id, operation, generation, attempts, updated_at)
             SELECT 'profile', platform || '_' || lower(username), 'upsert', 1, 0,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             FROM player_profiles",
            [],
        )?;
        connection.execute(
            "INSERT OR IGNORE INTO cloud_sync_queue
             (entity_type, entity_id, operation, generation, attempts, updated_at)
             SELECT 'game', id, 'upsert', 1, 0,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             FROM saved_games",
            [],
        )?;
        connection.execute(
            "INSERT INTO app_metadata(key, value)
             VALUES ('cloud_sync_queue_initialized', '2')",
            [],
        )?;
    }
    Ok(())
}

fn account_uid_hash(uid: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(uid.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn initialize_account_registry(data_dir: &Path) -> rusqlite::Result<Connection> {
    let registry = Connection::open(data_dir.join("cloud-account-registry.sqlite3"))?;
    registry.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS accounts (
            uid_hash TEXT PRIMARY KEY,
            database_path TEXT NOT NULL,
            claimed_legacy_data INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            last_opened_at TEXT NOT NULL
        );",
    )?;
    Ok(registry)
}

fn legacy_owner_hash(guest: &Connection, registry: &Connection) -> Result<Option<String>, String> {
    if let Some(owner) = registry
        .query_row(
            "SELECT value FROM settings WHERE key = 'legacy_owner_hash'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Không thể đọc chủ sở hữu dữ liệu local cũ.".to_string())?
    {
        return Ok(Some(owner));
    }
    let previous_uids = {
        let mut statement = guest
            .prepare("SELECT DISTINCT uid FROM cloud_sync_cursors ORDER BY uid")
            .map_err(|_| "Không thể kiểm tra lịch sử tài khoản cloud.".to_string())?;
        let values = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|_| "Không thể đọc lịch sử tài khoản cloud.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Lịch sử tài khoản cloud không hợp lệ.".to_string())?;
        values
    };
    if previous_uids.len() > 1 {
        return Err(
            "Kho local cũ đã chứa dấu vết của nhiều tài khoản Firebase; không thể tự chọn tài khoản sở hữu an toàn."
                .to_string(),
        );
    }
    Ok(previous_uids.first().map(|uid| account_uid_hash(uid)))
}

fn activate_cloud_account_connection(
    active: &mut ActiveDatabase,
    uid: &str,
) -> Result<DatabaseActivationResult, String> {
    let uid = uid.trim();
    if uid.is_empty() || uid.len() > 128 {
        return Err("Firebase UID không hợp lệ.".to_string());
    }
    if active.active_uid.as_deref() == Some(uid) {
        return Ok(DatabaseActivationResult {
            changed: false,
            claimed_legacy_data: false,
        });
    }

    let uid_hash = account_uid_hash(uid);
    let accounts_dir = active.data_dir.join("cloud-accounts");
    fs::create_dir_all(&accounts_dir)
        .map_err(|_| "Không thể tạo thư mục dữ liệu tài khoản.".to_string())?;
    let account_path = accounts_dir.join(format!("{uid_hash}.sqlite3"));
    let account_existed = account_path.exists();
    let guest_path = active.data_dir.join("ky-pho.sqlite3");
    let guest = Connection::open(&guest_path)
        .map_err(|_| "Không thể mở kho local để chuyển dữ liệu.".to_string())?;
    initialize_database(&guest, true)
        .map_err(|_| "Không thể chuẩn bị kho local để chuyển dữ liệu.".to_string())?;
    let registry = initialize_account_registry(&active.data_dir)
        .map_err(|_| "Không thể mở registry tài khoản.".to_string())?;
    let reserved_owner = legacy_owner_hash(&guest, &registry)?.unwrap_or_else(|| uid_hash.clone());
    registry
        .execute(
            "INSERT OR IGNORE INTO settings(key, value)
             VALUES ('legacy_owner_hash', ?1)",
            params![&reserved_owner],
        )
        .map_err(|_| "Không thể lưu chủ sở hữu dữ liệu cũ.".to_string())?;
    let legacy_migrated = registry
        .query_row(
            "SELECT value FROM settings WHERE key = 'legacy_migrated'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "Không thể đọc trạng thái chuyển dữ liệu cũ.".to_string())?
        .is_some();
    let should_claim_legacy = !account_existed && !legacy_migrated && reserved_owner == uid_hash;

    if should_claim_legacy {
        if let Err(error) = guest.backup(DatabaseName::Main, &account_path, None) {
            let _ = fs::remove_file(&account_path);
            return Err(format!(
                "Không thể chuyển dữ liệu local sang tài khoản: {error}"
            ));
        }
    }
    let account_connection = Connection::open(&account_path)
        .map_err(|_| "Không thể mở kho riêng của tài khoản.".to_string())?;
    initialize_database(&account_connection, false)
        .map_err(|_| "Không thể chuẩn bị kho riêng của tài khoản.".to_string())?;
    if should_claim_legacy {
        registry
            .execute(
                "INSERT OR REPLACE INTO settings(key, value)
                 VALUES ('legacy_migrated', ?1)",
                params![&uid_hash],
            )
            .map_err(|_| "Không thể xác nhận chuyển dữ liệu local.".to_string())?;
    }
    registry
        .execute(
            "INSERT INTO accounts
             (uid_hash, database_path, claimed_legacy_data, created_at, last_opened_at)
             VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
             ON CONFLICT(uid_hash) DO UPDATE SET
               last_opened_at = datetime('now')",
            params![
                &uid_hash,
                account_path.to_string_lossy().as_ref(),
                i64::from(should_claim_legacy)
            ],
        )
        .map_err(|_| "Không thể cập nhật registry tài khoản.".to_string())?;

    active.connection = account_connection;
    active.active_uid = Some(uid.to_string());
    active.generation = active.generation.wrapping_add(1);
    Ok(DatabaseActivationResult {
        changed: true,
        claimed_legacy_data: should_claim_legacy,
    })
}

#[tauri::command]
fn activate_cloud_account(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
) -> Result<DatabaseActivationResult, String> {
    let mut active = database
        .0
        .lock()
        .map_err(|_| "Không thể chuyển kho dữ liệu tài khoản.".to_string())?;
    activate_cloud_account_connection(&mut active, &uid)
}

#[tauri::command]
fn deactivate_cloud_account(
    database: tauri::State<'_, DatabaseState>,
) -> Result<DatabaseActivationResult, String> {
    let mut active = database
        .0
        .lock()
        .map_err(|_| "Không thể chuyển về kho local.".to_string())?;
    if active.active_uid.is_none() {
        return Ok(DatabaseActivationResult {
            changed: false,
            claimed_legacy_data: false,
        });
    }
    let guest = Connection::open(active.data_dir.join("ky-pho.sqlite3"))
        .map_err(|_| "Không thể mở kho local.".to_string())?;
    initialize_database(&guest, true).map_err(|_| "Không thể chuẩn bị kho local.".to_string())?;
    active.connection = guest;
    active.active_uid = None;
    active.generation = active.generation.wrapping_add(1);
    Ok(DatabaseActivationResult {
        changed: true,
        claimed_legacy_data: false,
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
                    played_at TEXT,
                    eco TEXT,
                    opening TEXT,
                    time_control TEXT,
                    time_class TEXT,
                    source_url TEXT,
                    source_platform TEXT,
                    analysis_complete INTEGER NOT NULL DEFAULT 0,
                    analyzed_at TEXT,
                    created_at TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_saved_games_last_opened
                ON saved_games(last_opened_at DESC);
                CREATE TABLE IF NOT EXISTS engine_analyses (
                    game_id TEXT NOT NULL,
                    ply INTEGER NOT NULL,
                    engine_version TEXT NOT NULL,
                    depth INTEGER NOT NULL,
                    result_json TEXT NOT NULL,
                    color TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    quality TEXT NOT NULL,
                    centipawn_loss REAL NOT NULL,
                    think_time_seconds REAL,
                    is_quick INTEGER NOT NULL DEFAULT 0,
                    is_time_pressure INTEGER NOT NULL DEFAULT 0,
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(game_id, ply, engine_version)
                );
                CREATE INDEX IF NOT EXISTS idx_engine_analyses_game
                ON engine_analyses(game_id, engine_version, ply);
                CREATE TABLE IF NOT EXISTS player_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    username TEXT NOT NULL,
                    last_sync_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profiles_identity
                ON player_profiles(platform, username COLLATE NOCASE);
                CREATE TABLE IF NOT EXISTS game_profiles (
                    game_id TEXT NOT NULL,
                    profile_id INTEGER NOT NULL,
                    player_color TEXT NOT NULL,
                    linked_at TEXT NOT NULL,
                    PRIMARY KEY(game_id, profile_id)
                );
                CREATE INDEX IF NOT EXISTS idx_game_profiles_profile
                ON game_profiles(profile_id, game_id);
                CREATE TABLE IF NOT EXISTS cloud_sync_queue (
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    generation INTEGER NOT NULL DEFAULT 1,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_retry_at TEXT,
                    last_error TEXT,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(entity_type, entity_id)
                );
                CREATE INDEX IF NOT EXISTS idx_cloud_sync_queue_retry
                ON cloud_sync_queue(next_retry_at, updated_at);
                CREATE TABLE IF NOT EXISTS cloud_sync_cursors (
                    uid TEXT NOT NULL,
                    collection_name TEXT NOT NULL,
                    initialized INTEGER NOT NULL DEFAULT 0,
                    updated_at_seconds INTEGER,
                    updated_at_nanoseconds INTEGER,
                    document_id TEXT,
                    PRIMARY KEY(uid, collection_name)
                );
                CREATE TABLE IF NOT EXISTS app_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );",
            )?;
            for migration in [
                "ALTER TABLE saved_games ADD COLUMN opening TEXT",
                "ALTER TABLE saved_games ADD COLUMN time_class TEXT",
                "ALTER TABLE saved_games ADD COLUMN analysis_complete INTEGER NOT NULL DEFAULT 0",
                "ALTER TABLE saved_games ADD COLUMN analyzed_at TEXT",
                "ALTER TABLE saved_games ADD COLUMN source_platform TEXT",
                "ALTER TABLE saved_games ADD COLUMN played_at TEXT",
            ] {
                let _ = connection.execute(migration, []);
            }
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_saved_games_played_at ON saved_games(played_at DESC)",
                [],
            )?;
            backfill_played_at(&connection)?;
            connection.execute(
                "UPDATE saved_games
                 SET source_platform = CASE
                   WHEN source_url LIKE '%lichess.org%' THEN 'lichess'
                   WHEN source_url LIKE '%chess.com%' THEN 'chesscom'
                   ELSE source_platform
                 END
                 WHERE source_platform IS NULL",
                [],
            )?;
            let profile_count: i64 = connection.query_row(
                "SELECT COUNT(*) FROM player_profiles",
                [],
                |row| row.get(0),
            )?;
            if profile_count == 0 {
                connection.execute(
                    "INSERT INTO player_profiles (platform, username, created_at)
                     VALUES ('chesscom', 'Cuongkool', datetime('now'))",
                    [],
                )?;
                connection.execute(
                    "INSERT INTO player_profiles (platform, username, created_at)
                     VALUES ('lichess', 'chinsu1409', datetime('now'))",
                    [],
                )?;
            }
            connection.execute(
                "INSERT OR IGNORE INTO game_profiles (game_id, profile_id, player_color, linked_at)
                 SELECT sg.id, pp.id,
                        CASE WHEN lower(sg.white) = lower(pp.username) THEN 'w' ELSE 'b' END,
                        datetime('now')
                 FROM saved_games sg
                 JOIN player_profiles pp
                   ON lower(sg.white) = lower(pp.username) OR lower(sg.black) = lower(pp.username)
                 WHERE sg.source_platform IS NULL OR sg.source_platform = pp.platform",
                [],
            )?;
            let cloud_queue_initialized: Option<String> = connection
                .query_row(
                    "SELECT value FROM app_metadata WHERE key = 'cloud_sync_queue_initialized'",
                    [],
                    |row| row.get(0),
                )
                .optional()?;
            if cloud_queue_initialized.is_none() {
                connection.execute(
                    "INSERT OR IGNORE INTO cloud_sync_queue
                     (entity_type, entity_id, operation, generation, attempts, updated_at)
                     SELECT 'profile', platform || '_' || lower(username), 'upsert', 1, 0,
                            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                     FROM player_profiles",
                    [],
                )?;
                connection.execute(
                    "INSERT OR IGNORE INTO cloud_sync_queue
                     (entity_type, entity_id, operation, generation, attempts, updated_at)
                     SELECT 'game', id, 'upsert', 1, 0,
                            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                     FROM saved_games",
                    [],
                )?;
                connection.execute(
                    "INSERT INTO app_metadata(key, value)
                     VALUES ('cloud_sync_queue_initialized', '2')",
                    [],
                )?;
            }
            app.manage(DatabaseState(Mutex::new(ActiveDatabase {
                connection,
                data_dir,
                active_uid: None,
                generation: 0,
            })));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_chess_com_game,
            save_game,
            list_saved_games,
            open_saved_game,
            delete_saved_game,
            fetch_recent_games,
            save_engine_analysis,
            list_engine_analyses,
            mark_game_analysis_complete,
            get_dashboard_records,
            list_player_profiles,
            add_player_profile,
            delete_player_profile,
            mark_profile_synced,
            export_cloud_changes,
            merge_cloud_changes,
            get_cloud_sync_cursors,
            set_cloud_sync_cursors,
            acknowledge_cloud_changes,
            mark_cloud_changes_failed,
            activate_cloud_account,
            deactivate_cloud_account,
            begin_google_oauth,
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
