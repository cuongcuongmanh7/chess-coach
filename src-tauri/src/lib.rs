pub(crate) use reqwest::{Client, Url};
pub(crate) use rusqlite::{params, Connection, DatabaseName, OptionalExtension};
pub(crate) use serde::{Deserialize, Serialize};
pub(crate) use serde_json::Value;
pub(crate) use sha2::{Digest, Sha256};
pub(crate) use std::fs;
pub(crate) use std::io::{Read, Write};
pub(crate) use std::net::TcpListener;
pub(crate) use std::ops::{Deref, DerefMut};
pub(crate) use std::path::{Path, PathBuf};
pub(crate) use std::process::Command;
pub(crate) use std::sync::Mutex;
pub(crate) use std::thread;
pub(crate) use std::time::{Duration, Instant};
use tauri::Manager;

mod db {
    pub(crate) mod accounts;
    pub(crate) mod cloud_export;
    pub(crate) mod cloud_merge;
    pub(crate) mod cloud_state;
    pub(crate) mod games;
    pub(crate) mod migrations;
    #[cfg(test)]
    pub(crate) mod migrations_tests;
    pub(crate) mod profiles;
}
mod commands {
    pub(crate) mod ai;
    pub(crate) mod cloud;
    pub(crate) mod games;
    pub(crate) mod profiles;
    pub(crate) mod sources;
}
mod models;
mod services {
    pub(crate) mod ai_cache;
    pub(crate) mod ai_providers;
    pub(crate) mod game_sources;
    pub(crate) mod oauth;
}
mod state;
#[cfg(test)]
mod tests;

pub(crate) use db::accounts::*;
pub(crate) use db::cloud_export::*;
pub(crate) use db::cloud_merge::*;
pub(crate) use db::cloud_state::*;
pub(crate) use db::games::*;
pub(crate) use db::migrations::*;
pub(crate) use db::profiles::*;
pub(crate) use models::*;
pub(crate) use services::ai_cache::*;
pub(crate) use services::ai_providers::*;
pub(crate) use services::game_sources::*;
pub(crate) use services::oauth::*;
pub(crate) use state::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ApiKeyState::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let connection = open_database(&data_dir.join("ky-pho.sqlite3"), true)?;
            app.manage(DatabaseState(Mutex::new(ActiveDatabase {
                connection,
                data_dir,
                active_uid: None,
                generation: 0,
            })));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sources::fetch_chess_com_game,
            commands::games::save_game,
            commands::games::list_saved_games,
            commands::games::open_saved_game,
            commands::games::delete_saved_game,
            commands::sources::fetch_recent_games,
            commands::games::save_engine_analysis,
            commands::games::list_engine_analyses,
            commands::games::mark_game_analysis_complete,
            commands::games::get_dashboard_records,
            commands::profiles::list_player_profiles,
            commands::profiles::add_player_profile,
            commands::profiles::delete_player_profile,
            commands::profiles::mark_profile_synced,
            commands::cloud::export_cloud_changes,
            commands::cloud::merge_cloud_changes,
            commands::cloud::get_cloud_sync_cursors,
            commands::cloud::set_cloud_sync_cursors,
            commands::cloud::acknowledge_cloud_changes,
            commands::cloud::mark_cloud_changes_failed,
            commands::cloud::activate_cloud_account,
            commands::cloud::deactivate_cloud_account,
            commands::sources::begin_google_oauth,
            commands::ai::set_api_key,
            commands::ai::clear_api_key,
            commands::ai::has_api_key,
            commands::ai::get_cached_explanation,
            commands::ai::clear_ai_cache,
            commands::ai::explain_move,
            commands::ai::summarize_game
        ])
        .run(tauri::generate_context!())
        .expect("không thể khởi chạy ứng dụng Chess Coach");
}
