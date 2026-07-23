use crate::*;

pub(crate) fn account_uid_hash(uid: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(uid.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub(crate) fn initialize_account_registry(data_dir: &Path) -> rusqlite::Result<Connection> {
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

pub(crate) fn legacy_owner_hash(guest: &Connection, registry: &Connection) -> Result<Option<String>, String> {
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

pub(crate) fn activate_cloud_account_connection(
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
    let guest = open_database(&guest_path, true)
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
    let account_connection = open_database(&account_path, false)
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

pub(crate) fn activate_cloud_account(
    database: tauri::State<'_, DatabaseState>,
    uid: String,
) -> Result<DatabaseActivationResult, String> {
    let mut active = database
        .0
        .lock()
        .map_err(|_| "Không thể chuyển kho dữ liệu tài khoản.".to_string())?;
    activate_cloud_account_connection(&mut active, &uid)
}

pub(crate) fn deactivate_cloud_account(
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
    let guest = open_database(&active.data_dir.join("ky-pho.sqlite3"), true)
        .map_err(|_| "Không thể chuẩn bị kho local.".to_string())?;
    active.connection = guest;
    active.active_uid = None;
    active.generation = active.generation.wrapping_add(1);
    Ok(DatabaseActivationResult {
        changed: true,
        claimed_legacy_data: false,
    })
}
