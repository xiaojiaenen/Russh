use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub user: String,
    pub event_type: String,
    pub content: String,
    pub result: String,
    pub target_server: Option<String>,
    pub duration_ms: Option<u64>,
    pub hash: String,
}

pub struct AuditState {
    pub entries: Arc<Mutex<Vec<AuditEntry>>>,
}

impl Default for AuditState {
    fn default() -> Self {
        Self {
            entries: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl AuditEntry {
    pub fn compute_hash(&self) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        self.id.hash(&mut hasher);
        self.timestamp.to_rfc3339().hash(&mut hasher);
        self.event_type.hash(&mut hasher);
        self.content.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
}

#[tauri::command]
pub async fn audit_log_event(
    state: State<'_, AuditState>,
    event_type: String,
    content: String,
    result: String,
    target_server: Option<String>,
) -> Result<String, String> {
    let entry = AuditEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: Utc::now(),
        user: whoami::username(),
        event_type,
        content,
        result,
        target_server,
        duration_ms: None,
        hash: String::new(),
    };

    let mut entry = entry;
    entry.hash = entry.compute_hash();

    let id = entry.id.clone();
    let mut entries = state.entries.lock().await;
    entries.push(entry);

    Ok(id)
}

#[tauri::command]
pub async fn audit_query_logs(
    state: State<'_, AuditState>,
    event_type: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<AuditEntry>, String> {
    let entries = state.entries.lock().await;
    let limit = limit.unwrap_or(100);

    let filtered: Vec<AuditEntry> = entries
        .iter()
        .filter(|e| {
            if let Some(ref et) = event_type {
                e.event_type == *et
            } else {
                true
            }
        })
        .rev()
        .take(limit)
        .cloned()
        .collect();

    Ok(filtered)
}

#[tauri::command]
pub async fn audit_verify_integrity(
    state: State<'_, AuditState>,
) -> Result<bool, String> {
    let entries = state.entries.lock().await;

    for entry in entries.iter() {
        let computed = entry.compute_hash();
        if computed != entry.hash {
            return Ok(false);
        }
    }

    Ok(true)
}
