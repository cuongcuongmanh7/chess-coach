use crate::*;

#[tauri::command]
pub(crate) fn generate_training_cards(
    database: tauri::State<'_, DatabaseState>,
    request: GenerateTrainingCardsRequest,
) -> Result<GenerateTrainingCardsResult, String> {
    crate::generate_training_cards(database, request)
}

#[tauri::command]
pub(crate) fn list_training_cards(
    database: tauri::State<'_, DatabaseState>,
    request: ListTrainingCardsRequest,
) -> Result<Vec<TrainingCard>, String> {
    crate::list_training_cards(database, request)
}

#[tauri::command]
pub(crate) fn review_training_card(
    database: tauri::State<'_, DatabaseState>,
    request: ReviewTrainingCardRequest,
) -> Result<TrainingCard, String> {
    crate::review_training_card(database, request)
}

#[tauri::command]
pub(crate) fn update_training_card(
    database: tauri::State<'_, DatabaseState>,
    request: UpdateTrainingCardRequest,
) -> Result<TrainingCard, String> {
    crate::update_training_card(database, request)
}

#[tauri::command]
pub(crate) fn get_training_stats(
    database: tauri::State<'_, DatabaseState>,
    profile_id: i64,
) -> Result<TrainingStats, String> {
    crate::get_training_stats(database, profile_id)
}
