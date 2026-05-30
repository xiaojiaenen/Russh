use std::collections::HashMap;
use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::{Mutex, mpsc};
use tauri::{State, AppHandle, Emitter};

use russh::*;
use russh_keys::*;

use crate::models::connection::{AuthMethod, ConnectionConfig};

// SSH Client Handler
struct ClientHandler;

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        self,
        _server_public_key: &key::PublicKey,
    ) -> Result<(Self, bool), Self::Error> {
        // Accept all server keys (in production, verify the key)
        Ok((self, true))
    }
}

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

    // SSH client config
    let ssh_config = client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(60)),
        ..<_>::default()
    };
    let ssh_config = Arc::new(ssh_config);

    // Connect with SSH protocol
    let mut ssh_session = client::connect(ssh_config, addr.clone(), ClientHandler)
        .await
        .map_err(|e| format!("SSH connection failed: {}", e))?;

    // Authenticate
    let auth_result = match &config.auth {
        AuthMethod::Password { password } => {
            ssh_session
                .authenticate_password(&config.username, password)
                .await
                .map_err(|e| format!("Auth failed: {}", e))?
        }
        AuthMethod::KeyFile { key_path, passphrase } => {
            let key_pair = load_secret_key(key_path, passphrase.as_deref())
                .map_err(|e| format!("Failed to load key: {}", e))?;
            ssh_session
                .authenticate_publickey(&config.username, Arc::new(key_pair))
                .await
                .map_err(|e| format!("Auth failed: {}", e))?
        }
        _ => {
            return Err("Unsupported auth method".to_string());
        }
    };

    if !auth_result {
        return Err("Authentication failed".to_string());
    }

    // Open a session channel
    let mut channel = ssh_session
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open channel: {}", e))?;

    // Request PTY
    channel
        .request_pty(
            false,
            "xterm-256color",
            80, 24, 0, 0,
            &[],
        )
        .await
        .map_err(|e| format!("Failed to request PTY: {}", e))?;

    // Start interactive shell
    channel
        .request_shell(true)
        .await
        .map_err(|e| format!("Failed to start shell: {}", e))?;

    // Create channels for I/O
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

    // Spawn I/O task
    let emit_session_id = session_id.clone();
    let app_clone = app.clone();
    tokio::spawn(async move {
        use tokio::io::AsyncReadExt;

        let mut channel = channel;
        let mut buf = vec![0u8; 4096];

        loop {
            tokio::select! {
                // Read from SSH channel -> emit to frontend
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { ref data }) => {
                            let text = String::from_utf8_lossy(data).to_string();
                            let _ = app_clone.emit("terminal_data", TerminalData {
                                session_id: emit_session_id.clone(),
                                data: text,
                            });
                        }
                        Some(ChannelMsg::ExitStatus { exit_status }) => {
                            let _ = app_clone.emit("connection_status", ConnectionStatus {
                                session_id: emit_session_id.clone(),
                                status: "disconnected".to_string(),
                                message: Some(format!("Shell exited with status {}", exit_status)),
                            });
                            break;
                        }
                        Some(ChannelMsg::Eof) => {
                            let _ = app_clone.emit("connection_status", ConnectionStatus {
                                session_id: emit_session_id.clone(),
                                status: "disconnected".to_string(),
                                message: Some("Channel closed".to_string()),
                            });
                            break;
                        }
                        None => {
                            let _ = app_clone.emit("connection_status", ConnectionStatus {
                                session_id: emit_session_id.clone(),
                                status: "disconnected".to_string(),
                                message: Some("Channel closed".to_string()),
                            });
                            break;
                        }
                        _ => {}
                    }
                }

                // Write from frontend -> SSH channel
                Some(data) = write_rx.recv() => {
                    if channel.data(&data[..]).await.is_err() {
                        break;
                    }
                }

                // Shutdown signal
                _ = shutdown_rx.recv() => {
                    let _ = channel.close().await;
                    break;
                }
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
        if let Some(tx) = session.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }
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

    let ssh_config = client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(5)),
        ..<_>::default()
    };
    let ssh_config = Arc::new(ssh_config);

    let mut ssh_session = client::connect(ssh_config, addr, ClientHandler)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    // Try authentication
    let auth_result = match &config.auth {
        AuthMethod::Password { password } => {
            ssh_session
                .authenticate_password(&config.username, password)
                .await
                .map_err(|e| format!("Auth failed: {}", e))?
        }
        AuthMethod::KeyFile { key_path, passphrase } => {
            let key_pair = load_secret_key(key_path, passphrase.as_deref())
                .map_err(|e| format!("Failed to load key: {}", e))?;
            ssh_session
                .authenticate_publickey(&config.username, Arc::new(key_pair))
                .await
                .map_err(|e| format!("Auth failed: {}", e))?
        }
        _ => false,
    };

    if auth_result {
        let _ = ssh_session.disconnect(Disconnect::ByApplication, "", "English").await;
        Ok("Connection and authentication successful".to_string())
    } else {
        Err("Authentication failed".to_string())
    }
}
