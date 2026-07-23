use crate::*;

pub(crate) const COACH_PROMPT: &str = "Bạn là huấn luyện viên cờ vua nói tiếng Việt. Luôn viết tiếng Việt có dấu đầy đủ bằng Unicode; không được bỏ dấu ở bất kỳ từ tiếng Việt nào. Dữ liệu Stockfish và các trường màu quân là nguồn sự thật. Viết tổng cộng 70–90 từ trên đúng bốn dòng theo mẫu: 'ĐÁNH GIÁ: ...', 'Ý TƯỞNG: ...', 'SO SÁNH: ...', 'KẾ HOẠCH: ...'. Mỗi nhãn và toàn bộ nội dung của nhãn đó bắt buộc nằm trên cùng một dòng. Dòng ĐÁNH GIÁ kết luận thẳng về nước của ben_vua_di. Dòng Ý TƯỞNG giải thích lý do cụ thể. Dòng SO SÁNH đối chiếu ngắn với nuoc_tot_nhat. Dòng KẾ HOẠCH chỉ khuyên ben_toi_luot chơi nuoc_dap_tot_nhat sau vị trí thực tế; nếu không có nước đáp thì nói ván đã kết thúc. Khi nhắc quân đang tấn công, phòng thủ hoặc bị hạn chế, phải gọi đúng màu Trắng hoặc Đen theo ben_vua_di và ben_toi_luot; tuyệt đối không tự đảo màu quân. Bắt đầu ngay bằng nhãn, không chào hỏi, không câu chúc, không khen xã giao và không dùng lời dẫn. Giữ nguyên mọi ký hiệu nước cờ theo SAN như Bf4, e3, dxc4 hoặc O-O; không dịch hay đọc chúng thành chữ. Mọi điểm đánh giá phải giữ dạng có dấu và chữ số thập phân giống dữ liệu đầu vào, ví dụ +0.38 hoặc -1.25; tuyệt đối không viết số hay dấu thành chữ. Dùng Elo chỉ để điều chỉnh độ khó, không nhắc Elo trong câu trả lời. Không đưa lời khuyên chung chung; phải nêu quân, ô hoặc kế hoạch cụ thể. Tuyệt đối không chép hoặc nhắc tên khóa dữ liệu nội bộ như nuoc_tot_nhat, nuoc_dap_tot_nhat, ben_vua_di hay ben_toi_luot; chỉ diễn đạt ý nghĩa và giá trị thật của chúng bằng tiếng Việt tự nhiên. Không dùng Markdown, không nhắc lại FEN và không bịa thêm biến ngoài dữ liệu được cung cấp.";
pub(crate) const PROMPT_VERSION: &str = "coach-v7";
pub(crate) const GAME_SUMMARY_PROMPT: &str = "Bạn là huấn luyện viên cờ vua nói tiếng Việt. Hãy đưa ra nhận xét sơ bộ về toàn ván chỉ từ thống kê Stockfish và các vị trí then chốt được cung cấp. Luôn viết tiếng Việt có dấu đầy đủ bằng Unicode. Viết 150–220 từ trên đúng bảy dòng theo mẫu: 'TỔNG QUAN: ...', 'TRẮNG · ĐIỂM MẠNH: ...', 'TRẮNG · CẦN CẢI THIỆN: ...', 'TRẮNG · ƯU TIÊN: ...', 'ĐEN · ĐIỂM MẠNH: ...', 'ĐEN · CẦN CẢI THIỆN: ...', 'ĐEN · ƯU TIÊN: ...'. So sánh hai bên bằng ACPL, tỷ lệ Best/Tốt và số lỗi; chỉ nhắc nước cờ có trong critical_positions. Mỗi mục ưu tiên phải là đúng một chủ đề luyện tập cụ thể. Đây là đánh giá sơ bộ, không khẳng định phong cách hay tâm lý người chơi. Không chào hỏi, không câu chúc, không Markdown, không bịa chiến thuật, không nhắc FEN và không đọc ký hiệu nước cờ hay số thành chữ.";
pub(crate) const GAME_SUMMARY_PROMPT_VERSION: &str = "game-summary-v1";
pub(crate) const VIETNAMESE_DIACRITICS: &str = "ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵĂÂĐÊÔƠƯÁÀẢÃẠẤẦẨẪẬẮẰẲẴẶÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ";

pub(crate) fn has_vietnamese_diacritics(text: &str) -> bool {
    text.chars()
        .any(|character| VIETNAMESE_DIACRITICS.contains(character))
}

pub(crate) fn text_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

pub(crate) fn normalized_provider(provider: &str) -> Result<&str, String> {
    match provider {
        "openai" | "gemini" => Ok(provider),
        _ => Err("Nhà cung cấp AI chưa được hỗ trợ.".to_string()),
    }
}

pub(crate) fn environment_key(provider: &str) -> Option<String> {
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

pub(crate) fn api_key(state: &tauri::State<'_, ApiKeyState>, provider: &str) -> Result<String, String> {
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

pub(crate) fn provider_label(provider: &str) -> &str {
    if provider == "gemini" {
        "Gemini"
    } else {
        "OpenAI"
    }
}

pub(crate) fn set_api_key(
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

pub(crate) fn clear_api_key(state: tauri::State<'_, ApiKeyState>, provider: String) -> Result<(), String> {
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

pub(crate) fn has_api_key(state: tauri::State<'_, ApiKeyState>, provider: String) -> bool {
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

pub(crate) fn extract_output_text(response: &Value) -> Option<String> {
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

pub(crate) fn extract_gemini_text(response: &Value) -> Option<String> {
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

pub(crate) fn validate_model(provider: &str, model: &str) -> Result<(), String> {
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

pub(crate) fn explanation_cache_key(provider: &str, model: &str, request: &ExplainMoveRequest) -> String {
    let mut hasher = Sha256::new();
    hasher.update(PROMPT_VERSION.as_bytes());
    hasher.update(provider.as_bytes());
    hasher.update(model.as_bytes());
    hasher.update(serde_json::to_vec(request).unwrap_or_default());
    format!("{:x}", hasher.finalize())
}

pub(crate) fn game_summary_cache_key(provider: &str, model: &str, request: &ExplainGameRequest) -> String {
    let mut hasher = Sha256::new();
    hasher.update(GAME_SUMMARY_PROMPT_VERSION.as_bytes());
    hasher.update(provider.as_bytes());
    hasher.update(model.as_bytes());
    hasher.update(serde_json::to_vec(request).unwrap_or_default());
    format!("{:x}", hasher.finalize())
}

pub(crate) fn read_cached_explanation(
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

pub(crate) fn write_cached_explanation(
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

pub(crate) fn get_cached_explanation(
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

pub(crate) fn clear_ai_cache(database: tauri::State<'_, DatabaseState>) -> Result<u64, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Không thể mở bộ nhớ lời giải thích.".to_string())?;
    connection
        .execute("DELETE FROM ai_explanations", [])
        .map(|count| count as u64)
        .map_err(|_| "Không thể xoá dữ liệu AI đã lưu.".to_string())
}

pub(crate) fn move_input(request: &ExplainMoveRequest) -> Value {
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

pub(crate) const COACH_SECTION_LABELS: [&str; 4] = ["ĐÁNH GIÁ", "Ý TƯỞNG", "SO SÁNH", "KẾ HOẠCH"];

pub(crate) fn replace_internal_coach_fields(text: &str, request: &ExplainMoveRequest) -> String {
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

pub(crate) fn coach_section_fallbacks(request: &ExplainMoveRequest) -> [String; 4] {
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

pub(crate) fn normalize_coach_explanation(text: &str, request: &ExplainMoveRequest) -> String {
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
