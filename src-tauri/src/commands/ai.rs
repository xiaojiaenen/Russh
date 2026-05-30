use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{State, AppHandle, Emitter};

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

// Helper: call OpenAI-compatible chat completion API
async fn chat_completion(
    config: &AiConfig,
    messages: Vec<serde_json::Value>,
    stream: bool,
) -> Result<reqwest::Response, String> {
    if config.api_key.is_empty() {
        return Err("API key is required".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(config.timeout_secs as u64))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "stream": stream,
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
    });

    let url = format!("{}/chat/completions", config.base_url);

    client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))
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
    let messages = vec![
        serde_json::json!({"role": "user", "content": "Reply with just: OK"}),
    ];

    let response = chat_completion(&config, messages, false).await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No response");

    Ok(format!("Connection successful: {}", content))
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

    let user_message = request.messages.iter().rev().find(|m| m.role == "user");
    let prompt = user_message.map(|m| m.content.as_str()).unwrap_or("");

    let messages = vec![
        serde_json::json!({"role": "system", "content": "You are a Linux/Unix command expert. Given a natural language description, generate the appropriate Shell command. Return ONLY the command, no explanation. If multiple commands are needed, separate them with &&."}),
        serde_json::json!({"role": "user", "content": prompt}),
    ];

    let response = chat_completion(config, messages, false).await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let command = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

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

    let messages = vec![
        serde_json::json!({"role": "system", "content": "You are a Linux/Unix system administrator expert. Analyze command errors and provide clear explanations and fix suggestions. Be concise."}),
        serde_json::json!({"role": "user", "content": format!("Command: {}\nExit Code: {}\nStderr:\n{}\n\nExplain the error and suggest a fix.", command, exit_code, stderr)}),
    ];

    let response = chat_completion(config, messages, false).await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No analysis available")
        .to_string();

    Ok(AiResponse {
        content,
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

    let user_message = messages.iter().rev().find(|m| m.role == "user");
    let prompt = user_message.map(|m| m.content.as_str()).unwrap_or("");

    let api_messages = vec![
        serde_json::json!({"role": "system", "content": "You are a helpful AI assistant for server administration and DevOps tasks. Help users with SSH, Linux commands, system monitoring, and troubleshooting."}),
        serde_json::json!({"role": "user", "content": prompt}),
    ];

    let response = chat_completion(config, api_messages, false).await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No response")
        .to_string();

    Ok(AiResponse {
        content,
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

    let api_messages: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content,
            })
        })
        .collect();

    let response = chat_completion(config, api_messages, true).await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    // Process SSE stream
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" {
                    let _ = app.emit("ai_stream", AiStreamChunk {
                        content: String::new(),
                        done: true,
                    });
                    return Ok(());
                }

                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                        let _ = app.emit("ai_stream", AiStreamChunk {
                            content: delta.to_string(),
                            done: false,
                        });
                    }
                }
            }
        }
    }

    let _ = app.emit("ai_stream", AiStreamChunk {
        content: String::new(),
        done: true,
    });

    Ok(())
}
