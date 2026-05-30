use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;

use super::ssh::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TunnelInfo {
    pub id: String,
    pub tunnel_type: String,
    pub local_host: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub session_id: String,
    pub status: String,
    pub bytes_sent: u64,
    pub bytes_received: u64,
}

pub struct TunnelManager {
    pub tunnels: Arc<Mutex<HashMap<String, TunnelInfo>>>,
}

impl Default for TunnelManager {
    fn default() -> Self {
        Self {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn tunnel_create_local(
    state: State<'_, AppState>,
    tunnel_state: State<'_, TunnelManager>,
    session_id: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> Result<String, String> {
    let tunnel_id = uuid::Uuid::new_v4().to_string();

    let tunnel = TunnelInfo {
        id: tunnel_id.clone(),
        tunnel_type: "local".to_string(),
        local_host: "127.0.0.1".to_string(),
        local_port,
        remote_host: remote_host.clone(),
        remote_port,
        session_id: session_id.clone(),
        status: "running".to_string(),
        bytes_sent: 0,
        bytes_received: 0,
    };

    let mut tunnels = tunnel_state.tunnels.lock().await;
    tunnels.insert(tunnel_id.clone(), tunnel);

    tracing::info!(
        "Created local tunnel: {}:{} -> {}:{}",
        "127.0.0.1",
        local_port,
        remote_host,
        remote_port
    );

    Ok(tunnel_id)
}

#[tauri::command]
pub async fn tunnel_create_remote(
    state: State<'_, AppState>,
    tunnel_state: State<'_, TunnelManager>,
    session_id: String,
    remote_port: u16,
    local_host: String,
    local_port: u16,
) -> Result<String, String> {
    let tunnel_id = uuid::Uuid::new_v4().to_string();

    let tunnel = TunnelInfo {
        id: tunnel_id.clone(),
        tunnel_type: "remote".to_string(),
        local_host: local_host.clone(),
        local_port,
        remote_host: "0.0.0.0".to_string(),
        remote_port,
        session_id: session_id.clone(),
        status: "running".to_string(),
        bytes_sent: 0,
        bytes_received: 0,
    };

    let mut tunnels = tunnel_state.tunnels.lock().await;
    tunnels.insert(tunnel_id.clone(), tunnel);

    tracing::info!(
        "Created remote tunnel: {}:{} -> {}:{}",
        "0.0.0.0",
        remote_port,
        local_host,
        local_port
    );

    Ok(tunnel_id)
}

#[tauri::command]
pub async fn tunnel_create_dynamic(
    state: State<'_, AppState>,
    tunnel_state: State<'_, TunnelManager>,
    session_id: String,
    local_port: u16,
) -> Result<String, String> {
    let tunnel_id = uuid::Uuid::new_v4().to_string();

    let tunnel = TunnelInfo {
        id: tunnel_id.clone(),
        tunnel_type: "dynamic".to_string(),
        local_host: "127.0.0.1".to_string(),
        local_port,
        remote_host: "-".to_string(),
        remote_port: 0,
        session_id: session_id.clone(),
        status: "running".to_string(),
        bytes_sent: 0,
        bytes_received: 0,
    };

    let mut tunnels = tunnel_state.tunnels.lock().await;
    tunnels.insert(tunnel_id.clone(), tunnel);

    tracing::info!("Created dynamic tunnel (SOCKS5) on port {}", local_port);

    Ok(tunnel_id)
}

#[tauri::command]
pub async fn tunnel_close(
    tunnel_state: State<'_, TunnelManager>,
    tunnel_id: String,
) -> Result<(), String> {
    let mut tunnels = tunnel_state.tunnels.lock().await;
    if let Some(mut tunnel) = tunnels.get_mut(&tunnel_id) {
        tunnel.status = "stopped".to_string();
    }
    Ok(())
}

#[tauri::command]
pub async fn tunnel_list(
    tunnel_state: State<'_, TunnelManager>,
) -> Result<Vec<TunnelInfo>, String> {
    let tunnels = tunnel_state.tunnels.lock().await;
    Ok(tunnels.values().cloned().collect())
}
