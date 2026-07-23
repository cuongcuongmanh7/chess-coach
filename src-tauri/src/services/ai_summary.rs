use crate::*;

pub(crate) const GAME_SUMMARY_PROMPT: &str = "Bạn là huấn luyện viên cờ vua nói tiếng Việt. Chỉ dùng dữ liệu Stockfish được cung cấp. Viết 150–220 từ trên đúng bảy dòng: 'TỔNG QUAN: ...', 'TRẮNG · ĐIỂM MẠNH: ...', 'TRẮNG · CẦN CẢI THIỆN: ...', 'TRẮNG · ƯU TIÊN: ...', 'ĐEN · ĐIỂM MẠNH: ...', 'ĐEN · CẦN CẢI THIỆN: ...', 'ĐEN · ƯU TIÊN: ...'. So sánh hai bên bằng số nước, ACPL, tỷ lệ Best/Tốt và số lỗi. Mọi số liệu bắt buộc chép bằng chữ số từ input, ví dụ 52 nước, ACPL 62, 73%, 5 Blunder; tuyệt đối không viết thành năm mươi hai, sáu mươi hai hoặc bảy mươi ba phần trăm. Chỉ nhắc nước cờ có trong critical_positions. Mỗi ưu tiên là một chủ đề luyện tập cụ thể. Đây là đánh giá sơ bộ, không khẳng định phong cách hay tâm lý. Không chào hỏi, Markdown, FEN hoặc chiến thuật không có trong dữ liệu.";
pub(crate) const GAME_SUMMARY_PROMPT_VERSION: &str = "game-summary-v2";

const SUMMARY_LABELS: [&str; 7] = [
    "TỔNG QUAN",
    "TRẮNG · ĐIỂM MẠNH",
    "TRẮNG · CẦN CẢI THIỆN",
    "TRẮNG · ƯU TIÊN",
    "ĐEN · ĐIỂM MẠNH",
    "ĐEN · CẦN CẢI THIỆN",
    "ĐEN · ƯU TIÊN",
];
const NUMBER_WORDS: [&str; 13] = [
    "một", "hai", "ba", "bốn", "tư", "năm", "sáu", "bảy",
    "tám", "chín", "mười", "mươi", "trăm",
];

fn normalized_summary_lines(text: &str) -> Vec<String> {
    let cleaned = text.replace("**", "").replace("__", "").replace('`', "");
    SUMMARY_LABELS
        .iter()
        .filter_map(|label| {
            cleaned.lines().find_map(|raw| {
                let line = raw.trim().trim_matches(|character: char| {
                    character.is_whitespace() || matches!(character, '#' | '*' | '-' | '_')
                });
                line.starts_with(label).then(|| {
                    let content = line[label.len()..].trim_start_matches(|character: char| {
                        character.is_whitespace() || matches!(character, ':' | '·' | '|' | '-')
                    });
                    format!("{label}: {content}")
                })
            })
        })
        .collect()
}

pub(crate) fn summary_has_spelled_numbers(text: &str) -> bool {
    text.to_lowercase()
        .split(|character: char| !character.is_alphabetic())
        .any(|word| NUMBER_WORDS.contains(&word))
}

pub(crate) fn game_summary_is_valid(text: &str, request: &ExplainGameRequest) -> bool {
    let lines = normalized_summary_lines(text);
    if lines.len() != SUMMARY_LABELS.len() || summary_has_spelled_numbers(text) {
        return false;
    }
    let normalized = lines.join("\n");
    let total_moves = request.total_plies.div_ceil(2);
    [
        total_moves.to_string(),
        request.white.acpl.to_string(),
        request.black.acpl.to_string(),
        format!("{}%", request.white.best_good_rate),
        format!("{}%", request.black.best_good_rate),
    ]
    .iter()
    .all(|value| normalized.contains(value))
}

pub(crate) fn normalize_game_summary(text: &str, request: &ExplainGameRequest) -> String {
    if game_summary_is_valid(text, request) {
        normalized_summary_lines(text).join("\n")
    } else {
        deterministic_game_summary(request)
    }
}

fn error_count(player: &GamePlayerSummary) -> u32 {
    player.counts.mistake + player.counts.blunder
}

fn critical_example(request: &ExplainGameRequest, side: &str) -> String {
    request
        .critical_positions
        .iter()
        .find(|position| position.side.eq_ignore_ascii_case(side))
        .map(|position| {
            format!(
                "Ở nước {}, {} mất {} cp; Stockfish ưu tiên {}.",
                position.move_number,
                position.played_move,
                position.centipawn_loss,
                position.best_move
            )
        })
        .unwrap_or_else(|| "Không có vị trí Mistake/Blunder nổi bật trong dữ liệu đã lưu.".to_string())
}

pub(crate) fn deterministic_game_summary(request: &ExplainGameRequest) -> String {
    let total_moves = request.total_plies.div_ceil(2);
    let white_errors = error_count(&request.white);
    let black_errors = error_count(&request.black);
    let training_context = if request.opening.trim().is_empty() {
        "các vị trí then chốt"
    } else {
        request.opening.as_str()
    };
    [
        format!(
            "TỔNG QUAN: Ván đấu kéo dài {total_moves} nước, kết quả {}. Trắng có ACPL {} và {}% Best/Tốt; Đen có ACPL {} và {}% Best/Tốt.",
            request.result,
            request.white.acpl,
            request.white.best_good_rate,
            request.black.acpl,
            request.black.best_good_rate,
        ),
        format!(
            "TRẮNG · ĐIỂM MẠNH: Có {} Brilliant, {} Best và {} nước Tốt trong dữ liệu Stockfish.",
            request.white.counts.brilliant, request.white.counts.best, request.white.counts.good,
        ),
        format!(
            "TRẮNG · CẦN CẢI THIỆN: Có {white_errors} lỗi gồm {} Sai lầm và {} Blunder. {}",
            request.white.counts.mistake,
            request.white.counts.blunder,
            critical_example(request, "Trắng"),
        ),
        format!(
            "TRẮNG · ƯU TIÊN: Luyện lại các vị trí có CPL cao trong {}.",
            training_context,
        ),
        format!(
            "ĐEN · ĐIỂM MẠNH: Có {} Brilliant, {} Best và {} nước Tốt trong dữ liệu Stockfish.",
            request.black.counts.brilliant, request.black.counts.best, request.black.counts.good,
        ),
        format!(
            "ĐEN · CẦN CẢI THIỆN: Có {black_errors} lỗi gồm {} Sai lầm và {} Blunder. {}",
            request.black.counts.mistake,
            request.black.counts.blunder,
            critical_example(request, "Đen"),
        ),
        format!(
            "ĐEN · ƯU TIÊN: Luyện lại các vị trí có CPL cao trong {}.",
            training_context,
        ),
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player(acpl: i32, rate: i32) -> GamePlayerSummary {
        GamePlayerSummary {
            name: "Player".to_string(),
            elo: None,
            moves: 26,
            acpl,
            best_good_rate: rate,
            counts: SummaryQualityCounts {
                brilliant: 1,
                best: 12,
                good: 8,
                inaccuracy: 1,
                mistake: 2,
                blunder: 3,
            },
        }
    }

    fn request() -> ExplainGameRequest {
        ExplainGameRequest {
            opening: "Sicilian Defense".to_string(),
            result: "0-1".to_string(),
            total_plies: 104,
            white: player(79, 71),
            black: player(62, 73),
            critical_positions: vec![],
        }
    }

    #[test]
    fn rejects_spelled_numbers_and_fallback_keeps_digits() {
        assert!(summary_has_spelled_numbers("ACPL sáu mươi hai và bảy mươi ba phần trăm"));
        let fallback = normalize_game_summary("TỔNG QUAN: năm mươi hai nước", &request());
        assert!(fallback.contains("52 nước"));
        assert!(fallback.contains("ACPL 62"));
        assert!(fallback.contains("73%"));
        assert!(!summary_has_spelled_numbers(&fallback));
    }
}
