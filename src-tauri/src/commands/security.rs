use serde::{Deserialize, Serialize};
use regex::Regex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SafetyRule {
    pub pattern: String,
    pub risk_level: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SafetyCheckResult {
    pub risk_level: String,
    pub description: String,
    pub matched_rules: Vec<String>,
}

impl Default for SafetyRule {
    fn default() -> Self {
        Self {
            pattern: String::new(),
            risk_level: "safe".to_string(),
            description: String::new(),
            enabled: true,
        }
    }
}

pub fn get_builtin_rules() -> Vec<SafetyRule> {
    vec![
        SafetyRule {
            pattern: r"rm\s+-rf\s+/?\s*".to_string(),
            risk_level: "forbidden".to_string(),
            description: "Recursive delete root directory".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"mkfs\.".to_string(),
            risk_level: "forbidden".to_string(),
            description: "Format filesystem".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"dd\s+.*of=/dev/".to_string(),
            risk_level: "forbidden".to_string(),
            description: "Write to disk device".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r":(){ :\|:& };:".to_string(),
            risk_level: "forbidden".to_string(),
            description: "Fork bomb".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"chmod\s+777\s+/".to_string(),
            risk_level: "forbidden".to_string(),
            description: "Open root directory permissions".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"rm\s+-rf\s+~".to_string(),
            risk_level: "approval".to_string(),
            description: "Recursive delete user directory".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"shutdown\s+".to_string(),
            risk_level: "approval".to_string(),
            description: "Shutdown system".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"reboot".to_string(),
            risk_level: "approval".to_string(),
            description: "Reboot system".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"systemctl\s+(stop|disable)\s+".to_string(),
            risk_level: "approval".to_string(),
            description: "Stop system service".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"iptables\s+-F".to_string(),
            risk_level: "approval".to_string(),
            description: "Flush firewall rules".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"sudo\s+".to_string(),
            risk_level: "warning".to_string(),
            description: "Use sudo for privilege escalation".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"kill\s+-9\s+".to_string(),
            risk_level: "warning".to_string(),
            description: "Force kill process".to_string(),
            enabled: true,
        },
        SafetyRule {
            pattern: r"apt\s+(remove|purge)\s+".to_string(),
            risk_level: "warning".to_string(),
            description: "Uninstall software package".to_string(),
            enabled: true,
        },
    ]
}

#[tauri::command]
pub fn check_command_safety(command: String) -> Result<SafetyCheckResult, String> {
    let rules = get_builtin_rules();
    let mut matched_rules = Vec::new();
    let mut max_risk = "safe".to_string();

    for rule in &rules {
        if !rule.enabled {
            continue;
        }

        let re = Regex::new(&rule.pattern)
            .map_err(|e| format!("Invalid regex: {}", e))?;

        if re.is_match(&command) {
            matched_rules.push(rule.description.clone());

            // Priority: forbidden > approval > warning > safe
            match rule.risk_level.as_str() {
                "forbidden" => max_risk = "forbidden".to_string(),
                "approval" if max_risk != "forbidden" => max_risk = "approval".to_string(),
                "warning" if max_risk == "safe" => max_risk = "warning".to_string(),
                _ => {}
            }
        }
    }

    let description = match max_risk.as_str() {
        "forbidden" => "This command is absolutely forbidden and will not be executed.".to_string(),
        "approval" => "This command requires manual approval before execution.".to_string(),
        "warning" => "This command carries some risk. Please review before executing.".to_string(),
        _ => "This command appears to be safe.".to_string(),
    };

    Ok(SafetyCheckResult {
        risk_level: max_risk,
        description,
        matched_rules,
    })
}

#[tauri::command]
pub fn get_safety_rules() -> Vec<SafetyRule> {
    get_builtin_rules()
}
