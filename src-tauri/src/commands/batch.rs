use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{State, AppHandle, Emitter};

use super::ssh::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BatchTask {
    pub id: String,
    pub command: String,
    pub session_ids: Vec<String>,
    pub status: String,
    pub results: Vec<BatchResult>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BatchResult {
    pub session_id: String,
    pub server_name: String,
    pub output: String,
    pub success: bool,
}

#[derive(Clone, Serialize)]
pub struct BatchProgress {
    pub task_id: String,
    pub completed: usize,
    pub total: usize,
    pub result: Option<BatchResult>,
}

pub struct BatchState {
    pub tasks: Arc<Mutex<Vec<BatchTask>>>,
}

impl Default for BatchState {
    fn default() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[tauri::command]
pub async fn batch_execute(
    state: State<'_, AppState>,
    batch_state: State<'_, BatchState>,
    app: AppHandle,
    command: String,
    session_ids: Vec<String>,
) -> Result<String, String> {
    let task_id = uuid::Uuid::new_v4().to_string();

    let task = BatchTask {
        id: task_id.clone(),
        command: command.clone(),
        session_ids: session_ids.clone(),
        status: "running".to_string(),
        results: Vec::new(),
    };

    {
        let mut tasks = batch_state.tasks.lock().await;
        tasks.push(task);
    }

    let total = session_ids.len();
    let mut completed = 0;

    // Execute on each session
    for session_id in &session_ids {
        // Placeholder: would execute via SSH
        let result = BatchResult {
            session_id: session_id.clone(),
            server_name: format!("server-{}", &session_id[..8]),
            output: format!("Executed: {} on {}", command, session_id),
            success: true,
        };

        completed += 1;

        let _ = app.emit("batch_progress", BatchProgress {
            task_id: task_id.clone(),
            completed,
            total,
            result: Some(result.clone()),
        });

        // Update task results
        let mut tasks = batch_state.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.results.push(result);
            if completed == total {
                task.status = "completed".to_string();
            }
        }
    }

    Ok(task_id)
}

#[tauri::command]
pub async fn batch_get_task(
    batch_state: State<'_, BatchState>,
    task_id: String,
) -> Result<Option<BatchTask>, String> {
    let tasks = batch_state.tasks.lock().await;
    Ok(tasks.iter().find(|t| t.id == task_id).cloned())
}

#[tauri::command]
pub async fn batch_list_tasks(
    batch_state: State<'_, BatchState>,
) -> Result<Vec<BatchTask>, String> {
    let tasks = batch_state.tasks.lock().await;
    Ok(tasks.clone())
}
