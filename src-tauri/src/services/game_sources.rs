use crate::*;

pub(crate) async fn fetch_chess_com_game(game_url: String) -> Result<String, String> {
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

pub(crate) fn valid_username(username: &str) -> bool {
    !username.is_empty()
        && username.len() <= 40
        && username
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_-".contains(character))
}

pub(crate) fn normalized_time_class(value: Option<&str>) -> Option<&str> {
    match value {
        Some("bullet") => Some("bullet"),
        Some("blitz") => Some("blitz"),
        Some("rapid") => Some("rapid"),
        Some("classical") => Some("classical"),
        _ => None,
    }
}

pub(crate) fn split_multi_pgn(raw: &str) -> Vec<String> {
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

pub(crate) async fn fetch_recent_chess_com_games(
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

pub(crate) async fn fetch_recent_lichess_games(
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

pub(crate) async fn fetch_recent_games(request: FetchRecentGamesRequest) -> Result<Vec<String>, String> {
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
