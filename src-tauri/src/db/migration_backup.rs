use crate::*;

/// Nhãn phát hành gắn vào tên file backup trước khi nâng cấp schema.
/// Mỗi mốc thêm một schema version thì thêm một nhãn ở đây.
fn release_label(version: i64) -> &'static str {
    match version {
        i64::MIN..=1 => "v0.6.2",
        2 => "v0.7.0",
        3 => "v0.7.0-preview",
        4 => "v0.7.1",
        5 => "v0.8.0",
        6 => "v0.10.0",
        7 => "v0.11.0",
        _ => "v0.12.0",
    }
}

/// Sao lưu file DB một lần cho mỗi mốc nâng cấp, trước khi migration chạy.
pub(crate) fn backup_before_migration(
    connection: &Connection,
    path: &Path,
    version: i64,
) -> rusqlite::Result<()> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("database");
    let backup_path =
        path.with_file_name(format!("{file_name}.pre-{}.bak", release_label(version)));
    if !backup_path.exists() {
        connection.backup(DatabaseName::Main, &backup_path, None)?;
    }
    Ok(())
}
