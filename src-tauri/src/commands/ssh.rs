use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::tcp::OwnedWriteHalf;
use tokio::sync::{Mutex, mpsc};
use tauri::{State, AppHandle, Emitter};

use crate::models::connection::ConnectionConfig;

pub struct AppState {
    pub connections: Arc<Mutex<HashMap<String, ConnectionConfig>>>,
    pub active_sessions: Arc<Mutex<HashMap<String, SessionInfo>>>,
}

pub struct SessionInfo {
    pub id: String,
    pub config_id: String,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub shutdown_tx: Option<mpsc::Sender<()>>,
    pub write_tx: Option<mpsc::Sender<Vec<u8>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, serde::Serialize)]
pub struct TerminalData {
    pub session_id: String,
    pub data: String,
}

#[derive(Clone, serde::Serialize)]
pub struct ConnectionStatus {
    pub session_id: String,
    pub status: String,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn connect(
    state: State<'_, AppState>,
    app: AppHandle,
    config: ConnectionConfig,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let addr = format!("{}:{}", config.host, config.port);
    let socket_addr: std::net::SocketAddr = addr
        .parse()
        .map_err(|e: std::net::AddrParseError| format!("Invalid address: {}", e))?;

    let timeout = std::time::Duration::from_secs(config.timeout as u64);

    // TCP connect with timeout
    let stream = tokio::time::timeout(timeout, async {
        let s = tokio::net::TcpStream::connect(socket_addr)
            .await
            .map_err(|e| format!("TCP connection failed: {}", e))?;
        s.set_nodelay(true).ok();
        Ok::<_, String>(s)
    })
    .await
    .map_err(|_| "Connection timeout".to_string())?
    .map_err(|e| e)?;

    // Split into read and write halves
    let (reader, writer) = stream.into_split();

    // Create channels for write and shutdown
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    let (write_tx, mut write_rx) = mpsc::channel::<Vec<u8>>(256);

    let session = SessionInfo {
        id: session_id.clone(),
        config_id: config.id.clone(),
        connected_at: chrono::Utc::now(),
        shutdown_tx: Some(shutdown_tx),
        write_tx: Some(write_tx),
    };

    // Store session
    {
        let mut sessions = state.active_sessions.lock().await;
        sessions.insert(session_id.clone(), session);
    }

    // Update config
    {
        let mut connections = state.connections.lock().await;
        if let Some(cfg) = connections.get_mut(&config.id) {
            cfg.last_connected_at = Some(chrono::Utc::now());
        }
    }

    // Emit connected status
    let _ = app.emit("connection_status", ConnectionStatus {
        session_id: session_id.clone(),
        status: "connected".to_string(),
        message: Some(format!("Connected to {}:{}", config.host, config.port)),
    });

    // Spawn reader task
    let emit_session_id = session_id.clone();
    let app_clone = app.clone();
    tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut reader = reader;
        let mut buf = [0u8; 4096];

        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    break;
                }
                result = reader.read(&mut buf) => {
                    match result {
                        Ok(0) => {
                            let _ = app_clone.emit("connection_status", ConnectionStatus {
                                session_id: emit_session_id.clone(),
                                status: "disconnected".to_string(),
                                message: Some("Connection closed".to_string()),
                            });
                            break;
                        }
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
                            let _ = app_clone.emit("terminal_data", TerminalData {
                                session_id: emit_session_id.clone(),
                                data,
                            });
                        }
                        Err(_) => {
                            let _ = app_clone.emit("connection_status", ConnectionStatus {
                                session_id: emit_session_id.clone(),
                                status: "error".to_string(),
                                message: Some("Read error".to_string()),
                            });
                            break;
                        }
                    }
                }
            }
        }
    });

    // Spawn writer task
    tokio::spawn(async move {
        let mut writer = writer;

        while let Some(data) = write_rx.recv().await {
            if writer.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn disconnect(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.active_sessions.lock().await;
    if let Some(mut session) = sessions.remove(&session_id) {
        // Send shutdown signal
        if let Some(tx) = session.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }
        // Drop write_tx to close the channel
        session.write_tx.take();
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_write(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state.active_sessions.lock().await;
    if let Some(session) = sessions.get(&session_id) {
        if let Some(write_tx) = &session.write_tx {
            write_tx.send(data.into_bytes()).await
                .map_err(|e| format!("Write channel closed: {}", e))?;
            Ok(())
        } else {
            Err("No write channel".to_string())
        }
    } else {
        Err("Session not found".to_string())
    }
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
        drop(stream);
        Ok::<_, String>(())
    })
    .await
    {
        Ok(Ok(_)) => Ok("Connection successful".to_string()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Connection timeout".to_string()),
    }
}
