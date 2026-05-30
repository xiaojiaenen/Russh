use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

const STORE_NAME: &str = "russh.json";
const CONNECTIONS_KEY: &str = "connections";
const SETTINGS_KEY: &str = "settings";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub font_family: String,
    pub font_size: u32,
    pub auto_reconnect: bool,
    pub reconnect_attempts: u32,
    pub reconnect_interval: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font_family: "JetBrains Mono".to_string(),
            font_size: 14,
            auto_reconnect: true,
            reconnect_attempts: 3,
            reconnect_interval: 5,
        }
    }
}

pub fn get_store_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
pub async fn load_connections(app: AppHandle) -> Result<Vec<crate::models::connection::ConnectionConfig>, String> {
    let store = app.store(STORE_NAME).map_err(|e| e.to_string())?;

    if let Some(value) = store.get(CONNECTIONS_KEY) {
        let connections: Vec<crate::models::connection::ConnectionConfig> =
            serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
        Ok(connections)
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn save_connections(
    app: AppHandle,
    connections: Vec<crate::models::connection::ConnectionConfig>,
) -> Result<(), String> {
    let store = app.store(STORE_NAME).map_err(|e| e.to_string())?;

    let value = serde_json::to_value(&connections).map_err(|e| e.to_string())?;
    store.set(CONNECTIONS_KEY.to_string(), value);
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let store = app.store(STORE_NAME).map_err(|e| e.to_string())?;

    if let Some(value) = store.get(SETTINGS_KEY) {
        let settings: AppSettings = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
        Ok(settings)
    } else {
        Ok(AppSettings::default())
    }
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let store = app.store(STORE_NAME).map_err(|e| e.to_string())?;

    let value = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    store.set(SETTINGS_KEY.to_string(), value);
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}
