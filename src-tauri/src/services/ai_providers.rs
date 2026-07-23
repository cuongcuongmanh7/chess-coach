use crate::*;

pub(crate) async fn request_openai(
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

pub(crate) async fn request_gemini_once(
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

pub(crate) async fn request_gemini(
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

pub(crate) async fn explain_move(
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

async fn request_game_summary(
    client: &Client,
    key: &str,
    provider: &str,
    model: &str,
    instructions: &str,
    input: &Value,
) -> Result<String, String> {
    if provider == "gemini" {
        request_gemini(client, key, model, instructions, input, 700).await
    } else {
        request_openai(client, key, model, instructions, input, 700).await
    }
}

pub(crate) async fn summarize_game(
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
    let raw_text = request_game_summary(
        &client,
        &key,
        provider,
        &model,
        GAME_SUMMARY_PROMPT,
        &input,
    )
    .await?;
    let candidate = if game_summary_is_valid(&raw_text, &request) {
        raw_text
    } else {
        let retry_prompt = format!(
            "{GAME_SUMMARY_PROMPT} Phản hồi trước không đạt vì viết số thành chữ, thiếu số liệu gốc hoặc sai cấu trúc. Hãy sửa đúng bảy dòng và chép mọi số liệu bằng chữ số."
        );
        let retry_input = serde_json::json!({
            "du_lieu_goc": &request,
            "phan_hoi_can_sua": raw_text,
        });
        request_game_summary(
            &client,
            &key,
            provider,
            &model,
            &retry_prompt,
            &retry_input,
        )
        .await
        .unwrap_or_default()
    };
    let text = normalize_game_summary(&candidate, &request);
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
