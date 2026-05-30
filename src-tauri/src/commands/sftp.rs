use serde::{Deserialize, Serialize};
use tauri::State;

use super::ssh::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub permissions: String,
    pub modified_at: String,
    pub is_symlink: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransferTask {
    pub id: String,
    pub direction: String,
    pub local_path: String,
    pub remote_path: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub status: String,
    pub speed_bytes_per_sec: f64,
}

#[tauri::command]
pub async fn sftp_list_dir(
    _state: State<'_, AppState>,
    session_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    // Placeholder: in real implementation, this would use russh SFTP
    tracing::info!("SFTP list dir: session={}, path={}", session_id, path);

    // Return mock data for development
    let entries = vec![
        FileEntry {
            name: "..".to_string(),
            path: format!("{}/..", path),
            is_dir: true,
            size: 0,
            permissions: "drwxr-xr-x".to_string(),
            modified_at: "2024-01-01 00:00:00".to_string(),
            is_symlink: false,
        },
        FileEntry {
            name: "html".to_string(),
            path: format!("{}/html", path),
            is_dir: true,
            size: 4096,
            permissions: "drwxr-xr-x".to_string(),
            modified_at: "2024-05-30 12:00:00".to_string(),
            is_symlink: false,
        },
        FileEntry {
            name: "logs".to_string(),
            path: format!("{}/logs", path),
            is_dir: true,
            size: 4096,
            permissions: "drwxr-xr-x".to_string(),
            modified_at: "2024-05-30 10:00:00".to_string(),
            is_symlink: false,
        },
        FileEntry {
            name: "nginx.conf".to_string(),
            path: format!("{}/nginx.conf", path),
            is_dir: false,
            size: 2048,
            permissions: "-rw-r--r--".to_string(),
            modified_at: "2024-05-28 15:30:00".to_string(),
            is_symlink: false,
        },
        FileEntry {
            name: "app.js".to_string(),
            path: format!("{}/app.js", path),
            is_dir: false,
            size: 15360,
            permissions: "-rw-r--r--".to_string(),
            modified_at: "2024-05-29 09:00:00".to_string(),
            is_symlink: false,
        },
    ];

    Ok(entries)
}

#[tauri::command]
pub async fn sftp_upload_file(
    _state: State<'_, AppState>,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    tracing::info!(
        "SFTP upload: session={}, local={}, remote={}",
        session_id,
        local_path,
        remote_path
    );
    // Placeholder: real implementation would use russh SFTP
    Ok(())
}

#[tauri::command]
pub async fn sftp_download_file(
    _state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    tracing::info!(
        "SFTP download: session={}, remote={}, local={}",
        session_id,
        remote_path,
        local_path
    );
    Ok(())
}

#[tauri::command]
pub async fn sftp_delete(
    _state: State<'_, AppState>,
    session_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    tracing::info!(
        "SFTP delete: session={}, path={}, is_dir={}",
        session_id,
        path,
        is_dir
    );
    Ok(())
}

#[tauri::command]
pub async fn sftp_rename(
    _state: State<'_, AppState>,
    session_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    tracing::info!(
        "SFTP rename: session={}, old={}, new={}",
        session_id,
        old_path,
        new_path
    );
    Ok(())
}

#[tauri::command]
pub async fn sftp_mkdir(
    _state: State<'_, AppState>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    tracing::info!("SFTP mkdir: session={}, path={}", session_id, path);
    Ok(())
}
