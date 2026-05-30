use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;

use crate::models::connection::{AuthMethod, ConnectionConfig};

pub struct AppState {
    pub connections: Arc<Mutex<HashMap<String, ConnectionConfig>>>,
    pub active_sessions: Arc<Mutex<HashMap<String, SessionInfo>>>,
}

pub struct SessionInfo {
    pub id: String,
    pub config_id: String,
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn connect(
    state: State<'_, AppState>,
    config: ConnectionConfig,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    // Test SSH connection
    let addr = format!("{}:{}", config.host, config.port);
    let socket_addr: std::net::SocketAddr = addr
        .parse()
        .map_err(|e: std::net::AddrParseError| format!("Invalid address: {}", e))?;

    // Attempt connection with timeout
    let timeout = std::time::Duration::from_secs(config.timeout as u64);

    match tokio::time::timeout(timeout, async {
        // Try TCP connection first
        let stream = tokio::net::TcpStream::connect(socket_addr)
            .await
            .map_err(|e| format!("TCP connection failed: {}", e))?;

        stream
            .set_nodelay(true)
            .map_err(|e| format!("Failed to set TCP options: {}", e))?;

        Ok::<_, String>(stream)
    })
    .await
    {
        Ok(Ok(_stream)) => {
            // Store session info
            let session = SessionInfo {
                id: session_id.clone(),
                config_id: config.id.clone(),
                connected_at: chrono::Utc::now(),
            };

            let mut sessions = state.active_sessions.lock().await;
            sessions.insert(session_id.clone(), session);

            // Update config last connected time
            let mut connections = state.connections.lock().await;
            if let Some(mut cfg) = connections.get_mut(&config.id) {
                cfg.last_connected_at = Some(chrono::Utc::now());
            }

            Ok(session_id)
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Connection timeout".to_string()),
    }
}

#[tauri::command]
pub async fn disconnect(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.active_sessions.lock().await;
    sessions.remove(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn list_connections(
    state: State<'_, AppState>,
) -> Result<Vec<ConnectionConfig>, String> {
    let connections = state.connections.lock().await;
    Ok(connections.values().cloned().collect())
}

#[tauri::command]
pub async fn save_connection(
    state: State<'_, AppState>,
    config: ConnectionConfig,
) -> Result<(), String> {
    let mut connections = state.connections.lock().await;
    connections.insert(config.id.clone(), config);
    Ok(())
}

#[tauri::command]
pub async fn delete_connection(
    state: State<'_, AppState>,
    config_id: String,
) -> Result<(), String> {
    let mut connections = state.connections.lock().await;
    connections.remove(&config_id);
    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    config: ConnectionConfig,
) -> Result<String, String> {
    let addr = format!("{}:{}", config.host, config.port);
    let socket_addr: std::net::SocketAddr = addr
        .parse()
        .map_err(|e: std::net::AddrParseError| format!("Invalid address: {}", e))?;

    let timeout = std::time::Duration::from_secs(config.timeout as u64);

    match tokio::time::timeout(timeout, async {
        let stream = tokio::net::TcpStream::connect(socket_addr)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;
        Ok::<_, String>(stream)
    })
    .await
    {
        Ok(Ok(_)) => Ok("Connection successful".to_string()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Connection timeout".to_string()),
    }
}
