use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{State, AppHandle, Emitter};

use rig::client::{CompletionClient, ProviderClient};
use rig::completion::Prompt;
use rig::providers::openai;
use rig::streaming::{StreamedAssistantContent, StreamingPrompt};

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

#[derive(Clone, Serialize)]
pub struct AiStreamChunk {
    pub content: String,
    pub done: bool,
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

// Helper: build rig OpenAI client from config
// rig reads OPENAI_API_KEY and OPENAI_BASE_URL from env
fn build_client(config: &AiConfig) -> Result<openai::Client, String> {
    if config.api_key.is_empty() {
        return Err("API key is required".to_string());
    }

    // Set env vars for rig
    std::env::set_var("OPENAI_API_KEY", &config.api_key);
    if config.base_url != "https://api.openai.com/v1" {
        std::env::set_var("OPENAI_BASE_URL", &config.base_url);
    }

    openai::Client::from_env().map_err(|e| format!("Failed to create AI client: {}", e))
}

// Helper: get model name constant or use custom
fn model_name(config: &AiConfig) -> &str {
    &config.model
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
    let client = build_client(&config)?;

    let agent = client
        .agent(model_name(&config))
        .preamble("You are a helpful assistant. Reply with just: OK")
        .build();

    let response: String = agent
        .prompt("Test connection")
        .await
        .map_err(|e| format!("AI request failed: {}", e))?;

    Ok(format!("Connection successful: {}", response))
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
    let client = build_client(config)?;

    let user_message = request.messages.iter().rev().find(|m| m.role == "user");
    let prompt = user_message.map(|m| m.content.as_str()).unwrap_or("");

    let agent = client
        .agent(model_name(config))
        .preamble(
            "You are a Linux/Unix command expert. Given a natural language description, \
             generate the appropriate Shell command. Return ONLY the command, no explanation. \
             If multiple commands are needed, separate them with &&."
        )
        .temperature(config.temperature as f64)
        .build();

    let response: String = agent
        .prompt(prompt)
        .await
        .map_err(|e| format!("AI request failed: {}", e))?;

    let command = response.trim().to_string();

    Ok(AiResponse {
        content: format!("Generated command:\n{}", command),
        command: Some(command),
        risk_level: Some("safe".to_string()),
    })
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

    let config = config.ok_or("No AI configuration found")?;
    let client = build_client(config)?;

    let agent = client
        .agent(model_name(config))
        .preamble(
            "You are a Linux/Unix system administrator expert. Analyze command errors and provide \
             clear explanations and fix suggestions. Be concise."
        )
        .temperature(config.temperature as f64)
        .build();

    let prompt = format!(
        "Command: {}\nExit Code: {}\nStderr:\n{}\n\nExplain the error and suggest a fix.",
        command, exit_code, stderr
    );

    let response: String = agent
        .prompt(&prompt)
        .await
        .map_err(|e| format!("AI request failed: {}", e))?;

    Ok(AiResponse {
        content: response,
        command: None,
        risk_level: None,
    })
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

    let config = config.ok_or("No AI configuration found")?;
    let client = build_client(config)?;

    let user_message = messages.iter().rev().find(|m| m.role == "user");
    let prompt = user_message.map(|m| m.content.as_str()).unwrap_or("");

    let agent = client
        .agent(model_name(config))
        .preamble(
            "You are a helpful AI assistant for server administration and DevOps tasks. \
             Help users with SSH, Linux commands, system monitoring, and troubleshooting."
        )
        .temperature(config.temperature as f64)
        .build();

    let response: String = agent
        .prompt(prompt)
        .await
        .map_err(|e| format!("AI request failed: {}", e))?;

    Ok(AiResponse {
        content: response,
        command: None,
        risk_level: None,
    })
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

    let config = config.ok_or("No AI configuration found")?;
    let client = build_client(config)?;

    let user_message = messages.iter().rev().find(|m| m.role == "user");
    let prompt = user_message.map(|m| m.content.as_str()).unwrap_or("");

    let agent = client
        .agent(model_name(config))
        .preamble(
            "You are a helpful AI assistant for server administration and DevOps tasks. \
             Help users with SSH, Linux commands, system monitoring, and troubleshooting."
        )
        .temperature(config.temperature as f64)
        .build();

    use futures_util::StreamExt;

    let mut stream = agent.stream_prompt(prompt).await;

    while let Some(item) = stream.next().await {
        match item {
            Ok(rig::agent::MultiTurnStreamItem::StreamAssistantItem(
                StreamedAssistantContent::Text(text),
            )) => {
                let _ = app.emit("ai_stream", AiStreamChunk {
                    content: text.text,
                    done: false,
                });
            }
            Ok(rig::agent::MultiTurnStreamItem::FinalResponse(_)) => {
                let _ = app.emit("ai_stream", AiStreamChunk {
                    content: String::new(),
                    done: true,
                });
                break;
            }
            Err(e) => {
                let _ = app.emit("ai_stream", AiStreamChunk {
                    content: format!("Error: {}", e),
                    done: true,
                });
                break;
            }
            _ => {}
        }
    }

    Ok(())
}
