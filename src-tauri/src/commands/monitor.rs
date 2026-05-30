use serde::{Deserialize, Serialize};
use tauri::State;

use super::ssh::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CpuInfo {
    pub user: f64,
    pub system: f64,
    pub idle: f64,
    pub total: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryInfo {
    pub total: u64,
    pub used: u64,
    pub free: u64,
    pub available: u64,
    pub swap_total: u64,
    pub swap_used: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskInfo {
    pub filesystem: String,
    pub mount_point: String,
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub use_percent: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkInfo {
    pub interface: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub user: String,
    pub cpu: f64,
    pub mem: f64,
    pub command: String,
}

#[tauri::command]
pub async fn get_cpu_usage(
    _state: State<'_, AppState>,
    session_id: String,
) -> Result<CpuInfo, String> {
    tracing::info!("Monitor CPU: session={}", session_id);
    // Placeholder: would parse top/free output via SSH
    Ok(CpuInfo {
        user: 12.5,
        system: 8.3,
        idle: 79.2,
        total: 100.0,
    })
}

#[tauri::command]
pub async fn get_memory_usage(
    _state: State<'_, AppState>,
    session_id: String,
) -> Result<MemoryInfo, String> {
    tracing::info!("Monitor memory: session={}", session_id);
    Ok(MemoryInfo {
        total: 8 * 1024 * 1024 * 1024,
        used: 3 * 1024 * 1024 * 1024,
        free: 2 * 1024 * 1024 * 1024,
        available: 3 * 1024 * 1024 * 1024,
        swap_total: 2 * 1024 * 1024 * 1024,
        swap_used: 512 * 1024 * 1024,
    })
}

#[tauri::command]
pub async fn get_disk_usage(
    _state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<DiskInfo>, String> {
    tracing::info!("Monitor disk: session={}", session_id);
    Ok(vec![
        DiskInfo {
            filesystem: "/dev/sda1".to_string(),
            mount_point: "/".to_string(),
            total: 45 * 1024 * 1024 * 1024,
            used: 12 * 1024 * 1024 * 1024,
            available: 31 * 1024 * 1024 * 1024,
            use_percent: 28.0,
        },
    ])
}

#[tauri::command]
pub async fn get_network_usage(
    _state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<NetworkInfo>, String> {
    tracing::info!("Monitor network: session={}", session_id);
    Ok(vec![
        NetworkInfo {
            interface: "eth0".to_string(),
            rx_bytes: 1024 * 1024 * 100,
            tx_bytes: 1024 * 1024 * 50,
        },
    ])
}

#[tauri::command]
pub async fn get_process_list(
    _state: State<'_, AppState>,
    session_id: String,
    sort_by: String,
    limit: usize,
) -> Result<Vec<ProcessInfo>, String> {
    tracing::info!("Monitor processes: session={}, sort={}, limit={}", session_id, sort_by, limit);
    Ok(vec![
        ProcessInfo { pid: 1, user: "root".to_string(), cpu: 0.0, mem: 0.1, command: "/sbin/init".to_string() },
        ProcessInfo { pid: 1234, user: "www-data".to_string(), cpu: 12.5, mem: 8.2, command: "nginx: worker".to_string() },
        ProcessInfo { pid: 5678, user: "root".to_string(), cpu: 8.3, mem: 5.1, command: "node server.js".to_string() },
    ])
}

#[tauri::command]
pub async fn kill_process(
    _state: State<'_, AppState>,
    session_id: String,
    pid: u32,
    signal: String,
) -> Result<(), String> {
    tracing::info!("Kill process: session={}, pid={}, signal={}", session_id, pid, signal);
    Ok(())
}
