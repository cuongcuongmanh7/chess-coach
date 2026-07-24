use crate::*;

fn empty_merge_request() -> MergeCloudChangesRequest {
    MergeCloudChangesRequest {
        profiles: Vec::new(),
        games: Vec::new(),
        training_progress: Vec::new(),
        engine_analyses: Vec::new(),
        analysis_manifests: Vec::new(),
        training_attempts: Vec::new(),
        ai_explanations: Vec::new(),
    }
}

fn insert_game(connection: &Connection, game_id: &str) {
    connection
        .execute(
            "INSERT INTO saved_games
             (id, pgn, white, black, created_at, last_opened_at)
             VALUES (?1, '1. e4 e5', 'Learner', 'Opponent',
                     '2026-07-24T10:00:00Z', '2026-07-24T10:00:00Z')",
            params![game_id],
        )
        .unwrap();
}

fn cloud_analysis(game_id: &str, depth: u32) -> CloudEngineAnalysis {
    CloudEngineAnalysis {
        game_id: game_id.to_string(),
        ply: 1,
        engine_version: ENGINE_VERSION.to_string(),
        depth,
        multipv: engine_multipv() as u32,
        result: serde_json::json!({ "depth": depth }),
        color: "w".to_string(),
        phase: "Khai cuộc".to_string(),
        quality: "best".to_string(),
        centipawn_loss: 0.0,
        think_time_seconds: None,
        is_quick: false,
        is_time_pressure: false,
        tags: Vec::new(),
        updated_at: "2026-07-24T10:00:00Z".to_string(),
    }
}

#[test]
fn v6_migration_backfills_existing_cloud_content_without_deleting_it() {
    let connection = Connection::open_in_memory().unwrap();
    initialize_database(&connection, false).unwrap();
    let game_id = "a".repeat(64);
    let cache_key = "b".repeat(64);
    insert_game(&connection, &game_id);
    connection
        .execute(
            "UPDATE saved_games SET analysis_complete = 1,
             analyzed_at = '2026-07-24T10:00:00Z' WHERE id = ?1",
            params![&game_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO engine_analyses
             (game_id, ply, engine_version, depth, multipv, result_json, color,
              phase, quality, centipawn_loss, tags_json, updated_at)
             VALUES (?1, 1, ?2, 18, 2, '{\"depth\":18}', 'w',
                     'Khai cuộc', 'best', 0, '[]', '2026-07-24T10:00:00Z')",
            params![&game_id, ENGINE_VERSION],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO ai_explanations
             (cache_key, provider, model, prompt_version, explanation, created_at)
             VALUES (?1, 'openai', 'gpt-5.6-sol', 'coach-v7', 'Đã lưu',
                     '2026-07-24T10:00:00Z')",
            params![&cache_key],
        )
        .unwrap();
    connection
        .execute_batch(
            "DELETE FROM cloud_sync_queue;
             DELETE FROM analysis_manifests;
             UPDATE engine_analyses SET cloud_id = NULL;
             PRAGMA user_version = 5;",
        )
        .unwrap();

    initialize_database(&connection, false).unwrap();

    let engine_cloud_id: String = connection
        .query_row(
            "SELECT cloud_id FROM engine_analyses WHERE game_id = ?1",
            params![&game_id],
            |row| row.get(0),
        )
        .unwrap();
    let manifest_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM analysis_manifests WHERE game_id = ?1",
            params![&game_id],
            |row| row.get(0),
        )
        .unwrap();
    let queued: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM cloud_sync_queue
             WHERE entity_type IN ('engine_analysis', 'analysis_manifest', 'ai_explanation')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        engine_cloud_id,
        analysis_cloud_id(&game_id, 1, ENGINE_VERSION, 18, 2)
    );
    assert_eq!(manifest_count, 1);
    assert_eq!(queued, 3);
}

#[test]
fn cloud_analysis_merge_is_union_and_uses_the_deepest_result() {
    let mut connection = Connection::open_in_memory().unwrap();
    initialize_database(&connection, false).unwrap();
    let game_id = "c".repeat(64);
    let local_game_id = "9".repeat(64);
    insert_game(&connection, &game_id);
    insert_game(&connection, &local_game_id);
    let local_cloud_id = analysis_cloud_id(&local_game_id, 1, ENGINE_VERSION, 16, 2);
    connection
        .execute(
            "INSERT INTO engine_analyses
             (cloud_id, game_id, ply, engine_version, depth, multipv, result_json,
              color, phase, quality, centipawn_loss, tags_json, updated_at)
             VALUES (?1, ?2, 1, ?3, 16, 2, '{\"depth\":16}', 'w',
                     'Khai cuộc', 'best', 0, '[]', '2026-07-24T09:00:00Z')",
            params![local_cloud_id, &local_game_id, ENGINE_VERSION],
        )
        .unwrap();
    let shallow = cloud_analysis(&game_id, 12);
    let deep = cloud_analysis(&game_id, 18);
    let manifest = CloudAnalysisManifest {
        game_id: game_id.clone(),
        engine_version: ENGINE_VERSION.to_string(),
        multipv: 2,
        ply_count: 1,
        completed_at: "2026-07-24T10:05:00Z".to_string(),
        updated_at: "2026-07-24T10:05:00Z".to_string(),
    };
    let mut request = empty_merge_request();
    request.engine_analyses = vec![shallow, deep]
        .into_iter()
        .map(|data| CloudRemoteEngineAnalysisChange {
            document_id: analysis_cloud_id(
                &data.game_id,
                data.ply,
                &data.engine_version,
                data.depth,
                data.multipv,
            ),
            deleted: false,
            data: Some(data),
        })
        .collect();
    request.analysis_manifests = vec![CloudRemoteAnalysisManifestChange {
        document_id: analysis_manifest_cloud_id(&game_id, ENGINE_VERSION, 2),
        deleted: false,
        data: Some(manifest),
    }];

    let merged = merge_cloud_changes_connection(&mut connection, request).unwrap();
    let stored = list_engine_analyses_connection(&connection, &game_id).unwrap();
    let rows: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM engine_analyses WHERE game_id = ?1",
            params![&game_id],
            |row| row.get(0),
        )
        .unwrap();
    let complete: i64 = connection
        .query_row(
            "SELECT analysis_complete FROM saved_games WHERE id = ?1",
            params![&game_id],
            |row| row.get(0),
        )
        .unwrap();
    let untouched_local: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM engine_analyses WHERE game_id = ?1",
            params![&local_game_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(merged.engine_analyses_merged, 2);
    assert_eq!(rows, 2);
    assert_eq!(stored[0].depth, 18);
    assert_eq!(complete, 1);
    assert_eq!(untouched_local, 1);
}

#[test]
fn training_attempts_and_ai_cache_merge_idempotently() {
    let mut connection = Connection::open_in_memory().unwrap();
    initialize_database(&connection, false).unwrap();
    let game_id = "d".repeat(64);
    let profile_key = "chesscom:learner";
    let card_id = training_card_id(profile_key, &game_id, 1);
    let attempt_id = "e".repeat(64);
    let cache_key = "f".repeat(64);
    insert_game(&connection, &game_id);
    connection
        .execute(
            "INSERT INTO player_profiles(platform, username, created_at)
             VALUES ('chesscom', 'learner', '2026-07-24T10:00:00Z')",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO game_profiles(game_id, profile_id, player_color, linked_at)
             VALUES (?1, 1, 'w', '2026-07-24T10:00:00Z')",
            params![&game_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO training_cards
             (id, profile_id, game_id, ply, engine_version, fen, side_to_move,
              played_move, best_move, best_line_json, quality, centipawn_loss,
              phase, tags_json, due_at, created_at, updated_at)
             VALUES (?1, 1, ?2, 1, ?3, 'fen', 'w', 'e4', 'd4', '[]',
                     'mistake', 120, 'Khai cuộc', '[]',
                     '2026-07-24T10:00:00Z', '2026-07-24T10:00:00Z',
                     '2026-07-24T10:00:00Z')",
            params![&card_id, &game_id, ENGINE_VERSION],
        )
        .unwrap();
    let attempt = CloudTrainingAttempt {
        cloud_id: attempt_id.clone(),
        card_id: card_id.clone(),
        game_id: game_id.clone(),
        profile_key: profile_key.to_string(),
        ply: 1,
        engine_version: ENGINE_VERSION.to_string(),
        attempted_move: Some("d4".to_string()),
        result: "clean".to_string(),
        centipawn_loss: Some(0.0),
        hints_used: 0,
        failed_attempts: 0,
        duration_ms: Some(1_000),
        attempted_at: "2026-07-24T10:01:00Z".to_string(),
    };
    let explanation = CloudAiExplanation {
        cache_key: cache_key.clone(),
        provider: "openai".to_string(),
        model: "gpt-5.6-sol".to_string(),
        prompt_version: "coach-v7".to_string(),
        explanation: "Nội dung đã lưu".to_string(),
        created_at: "2026-07-24T10:01:00Z".to_string(),
    };
    let mut request = empty_merge_request();
    request.training_attempts = (0..2)
        .map(|_| CloudRemoteTrainingAttemptChange {
            document_id: attempt_id.clone(),
            deleted: false,
            data: Some(attempt.clone()),
        })
        .collect();
    request.ai_explanations = (0..2)
        .map(|_| CloudRemoteAiExplanationChange {
            document_id: cache_key.clone(),
            deleted: false,
            data: Some(explanation.clone()),
        })
        .collect();

    let merged = merge_cloud_changes_connection(&mut connection, request).unwrap();
    let attempt_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM training_attempts", [], |row| {
            row.get(0)
        })
        .unwrap();
    let cache_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM ai_explanations", [], |row| row.get(0))
        .unwrap();
    assert_eq!(merged.training_attempts_merged, 1);
    assert_eq!(merged.ai_explanations_merged, 1);
    assert_eq!(attempt_count, 1);
    assert_eq!(cache_count, 1);
}
