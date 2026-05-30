use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{State, AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct AiStreamChunk {
    pub content: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConfig {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub timeout_secs: u32,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: "OpenAI".to_string(),
            provider: "openai_compatible".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: String::new(),
            model: "gpt-4o".to_string(),
            temperature: 0.7,
            max_tokens: 4096,
            timeout_secs: 30,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiRequest {
    pub messages: Vec<AiMessage>,
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiResponse {
    pub content: String,
    pub command: Option<String>,
    pub risk_level: Option<String>,
}

pub struct AiState {
    pub configs: Arc<Mutex<HashMap<String, AiConfig>>>,
    pub active_config_id: Arc<Mutex<Option<String>>>,
}

impl Default for AiState {
    fn default() -> Self {
        Self {
            configs: Arc::new(Mutex::new(HashMap::new())),
            active_config_id: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub async fn ai_save_config(
    state: State<'_, AiState>,
    config: AiConfig,
) -> Result<(), String> {
    let mut configs = state.configs.lock().await;
    configs.insert(config.id.clone(), config);
    Ok(())
}

#[tauri::command]
pub async fn ai_list_configs(
    state: State<'_, AiState>,
) -> Result<Vec<AiConfig>, String> {
    let configs = state.configs.lock().await;
    Ok(configs.values().cloned().collect())
}

#[tauri::command]
pub async fn ai_delete_config(
    state: State<'_, AiState>,
    config_id: String,
) -> Result<(), String> {
    let mut configs = state.configs.lock().await;
    configs.remove(&config_id);
    Ok(())
}

#[tauri::command]
pub async fn ai_test_connection(
    config: AiConfig,
) -> Result<String, String> {
    // Placeholder: would make actual API call
    if config.api_key.is_empty() {
        return Err("API key is required".to_string());
    }
    Ok(format!("Connection to {} successful", config.base_url))
}

#[tauri::command]
pub async fn ai_nl_to_command(
    state: State<'_, AiState>,
    request: AiRequest,
) -> Result<AiResponse, String> {
    let configs = state.configs.lock().await;
    let active_id = state.active_config_id.lock().await;

    let config = active_id
        .as_ref()
        .and_then(|id| configs.get(id))
        .or_else(|| configs.values().next());

    let config = config.ok_or("No AI configuration found")?;

    // Placeholder: would call rig/AI API
    // For now, return a mock response
    let user_message = request.messages.iter().rev().find(|m| m.role == "user");
    let prompt = user_message.map(|m| m.content.as_str()).unwrap_or("");

    let response = AiResponse {
        content: format!("Based on your request: \"{}\"\n\nHere is the suggested command:", prompt),
        command: Some(format!("echo \"Processing: {}\"", prompt)),
        risk_level: Some("safe".to_string()),
    };

    Ok(response)
}

#[tauri::command]
pub async fn ai_analyze_error(
    state: State<'_, AiState>,
    command: String,
    exit_code: i32,
    stderr: String,
) -> Result<AiResponse, String> {
    let configs = state.configs.lock().await;
    let active_id = state.active_config_id.lock().await;

    let config = active_id
        .as_ref()
        .and_then(|id| configs.get(id))
        .or_else(|| configs.values().next());

    let _config = config.ok_or("No AI configuration found")?;

    // Placeholder: would call AI API
    let response = AiResponse {
        content: format!(
            "Error Analysis:\n\nCommand: {}\nExit Code: {}\n\nThe command failed. Here are some suggestions:",
            command, exit_code
        ),
        command: None,
        risk_level: None,
    };

    Ok(response)
}

#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AiState>,
    messages: Vec<AiMessage>,
) -> Result<AiResponse, String> {
    let configs = state.configs.lock().await;
    let active_id = state.active_config_id.lock().await;

    let config = active_id
        .as_ref()
        .and_then(|id| configs.get(id))
        .or_else(|| configs.values().next());

    let _config = config.ok_or("No AI configuration found")?;

    // Placeholder: would call AI API
    let user_message = messages.iter().rev().find(|m| m.role == "user");
    let prompt = user_message.map(|m| m.content.as_str()).unwrap_or("");

    let response = AiResponse {
        content: format!("I understand you're asking about: \"{}\"\n\nLet me help you with that.", prompt),
        command: None,
        risk_level: None,
    };

    Ok(response)
}

#[tauri::command]
pub async fn ai_chat_stream(
    state: State<'_, AiState>,
    app: AppHandle,
    messages: Vec<AiMessage>,
) -> Result<(), String> {
    let configs = state.configs.lock().await;
    let active_id = state.active_config_id.lock().await;

    let config = active_id
        .as_ref()
        .and_then(|id| configs.get(id))
        .or_else(|| configs.values().next());

    let _config = config.ok_or("No AI configuration found")?;

    let user_message = messages.iter().rev().find(|m| m.role == "user");
    let prompt = user_message.map(|m| m.content.as_str()).unwrap_or("");

    // Simulate streaming response (placeholder for real rig API streaming)
    let full_response = format!(
        "Based on your request: \"{}\"\n\n\
         Here is my analysis and suggestion:\n\n\
         The command you need depends on the specific context of your server. \
         Here are some common approaches:\n\n\
         1. First, check the current state\n\
         2. Then apply the necessary changes\n\
         3. Verify the results\n\n\
         Would you like me to generate a specific command?",
        prompt
    );

    // Simulate chunked streaming
    let chunk_size = 20;
    let chars: Vec<char> = full_response.chars().collect();

    for (i, chunk) in chars.chunks(chunk_size).enumerate() {
        let chunk_str: String = chunk.iter().collect();
        let done = i * chunk_size >= chars.len() - chunk_size;

        let _ = app.emit("ai_stream", AiStreamChunk {
            content: chunk_str,
            done,
        });

        // Simulate network delay
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    }

    Ok(())
}
