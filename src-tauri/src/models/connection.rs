use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub group: String,
    pub host: String,
    pub port: u16,
    pub auth: AuthMethod,
    pub username: String,
    pub keepalive_interval: u32,
    pub timeout: u32,
    pub encoding: String,
    pub terminal_type: String,
    pub tags: Vec<String>,
    pub notes: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_connected_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AuthMethod {
    Password { password: String },
    KeyFile { key_path: String, passphrase: Option<String> },
    Certificate { cert_path: String, key_path: String },
    KeyboardInteractive,
}

impl Default for ConnectionConfig {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: String::new(),
            group: String::from("default"),
            host: String::new(),
            port: 22,
            auth: AuthMethod::Password { password: String::new() },
            username: String::from("root"),
            keepalive_interval: 60,
            timeout: 10,
            encoding: String::from("UTF-8"),
            terminal_type: String::from("xterm-256color"),
            tags: Vec::new(),
            notes: String::new(),
            created_at: now,
            updated_at: now,
            last_connected_at: None,
        }
    }
}
