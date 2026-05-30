use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptEntry {
    pub id: String,
    pub name: String,
    pub content: String,
    pub language: String,
    pub category: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub use_count: u32,
}

pub struct ScriptState {
    pub scripts: Arc<Mutex<Vec<ScriptEntry>>>,
}

impl Default for ScriptState {
    fn default() -> Self {
        Self {
            scripts: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[tauri::command]
pub async fn script_save(
    state: State<'_, ScriptState>,
    script: ScriptEntry,
) -> Result<(), String> {
    let mut scripts = state.scripts.lock().await;
    if let Some(existing) = scripts.iter_mut().find(|s| s.id == script.id) {
        *existing = script;
    } else {
        scripts.push(script);
    }
    Ok(())
}

#[tauri::command]
pub async fn script_list(
    state: State<'_, ScriptState>,
) -> Result<Vec<ScriptEntry>, String> {
    let scripts = state.scripts.lock().await;
    Ok(scripts.clone())
}

#[tauri::command]
pub async fn script_delete(
    state: State<'_, ScriptState>,
    script_id: String,
) -> Result<(), String> {
    let mut scripts = state.scripts.lock().await;
    scripts.retain(|s| s.id != script_id);
    Ok(())
}

#[tauri::command]
pub async fn script_get(
    state: State<'_, ScriptState>,
    script_id: String,
) -> Result<Option<ScriptEntry>, String> {
    let scripts = state.scripts.lock().await;
    Ok(scripts.iter().find(|s| s.id == script_id).cloned())
}
