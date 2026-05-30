# Russh — 完整技术设计方案

> 版本：v1.0 | 日期：2026-05-30

---

## 目录

1. [架构决策与分层设计](#1-架构决策与分层设计)
2. [IPC 合约与模块通信](#2-ipc-合约与模块通信)
3. [SSH 连接管理模块设计](#3-ssh-连接管理模块设计)
4. [终端渲染模块设计](#4-终端渲染模块设计)
5. [SFTP 文件管理模块设计](#5-sftp-文件管理模块设计)
6. [系统资源监控模块设计](#6-系统资源监控模块设计)
7. [网络工具模块设计](#7-网络工具模块设计)
8. [运维工具模块设计](#8-运维工具模块设计)
9. [AI 功能模块设计](#9-ai-功能模块设计)
10. [安全体系设计](#10-安全体系设计)
11. [前端设计系统](#11-前端设计系统)
12. [页面布局设计](#12-页面布局设计)
13. [组件库设计](#13-组件库设计)
14. [性能优化设计](#14-性能优化设计)
15. [部署与分发设计](#15-部署与分发设计)
16. [技术选型确认](#16-技术选型确认)

---

## 1. 架构决策与分层设计

### 1.1 技术选型决策

选择 Tauri v2.0 作为桌面容器，核心权衡如下：

| 维度 | 纯原生 (Swift+AppKit / C#+WPF) | Tauri v2.0 | Electron |
|------|------|------|------|
| 原生感 | 完美 | 接近原生，少量抽象泄漏 | 差，Chromium 包装 |
| 跨平台复用 | 需写两套 UI | 一套 React 代码库 | 一套 React 代码库 |
| 内存基线 | macOS 90MB / Win 130MB | 略高 | 300MB+ |
| 冷启动 | < 200ms | < 800ms | > 2s |
| 开发速度 | 慢，双平台独立迭代 | 快，热重载 | 快，热重载 |
| 安全沙箱 | 依赖平台实现 | Rust 原生，内存安全 | Node.js，GC 暴露面大 |
| 打包体积 | 小 | 小 (约 10MB) | 大 (约 150MB) |

结论：对于 SSH 客户端，Tauri 在原生感上的少量妥协换取了一套代码库覆盖三平台的效率优势，这个权衡是值得的。

### 1.2 四层架构

```
+-----------------------------------------------------------+
|  Layer 1: Tauri Native Shell (Rust)                        |
|  窗口管理 / 全局热键 / 系统托盘 / 菜单 / 材质              |
|  WebView 生命周期 / 崩溃报告 / 自动更新                     |
+-----------------------------------------------------------+
|  Layer 2: WebView + React UI (TypeScript)                  |
|  终端渲染 / SFTP 面板 / 监控面板 / AI 侧边栏               |
|  每个窗口类型独立 HTML 入口，独立 JS Bundle                  |
+-----------------------------------------------------------+
|  Layer 3: Tauri Backend Commands (Rust)                    |
|  SSH 连接池 / SFTP 操作 / AI 服务 / 审计日志               |
|  配置管理 / 端口转发 / 监控数据采集                         |
+-----------------------------------------------------------+
|  Layer 4: Rust Core Libraries                              |
|  russh SSH 协议栈 / rig AI 框架 / 加密存储                  |
|  命令安全检查 / 文件索引 / 性能关键路径                     |
+-----------------------------------------------------------+
```

各层职责边界清晰：

- Layer 1 只负责窗口生命周期和系统交互，不包含业务逻辑
- Layer 2 只负责 UI 渲染，通过 IPC 调用 Layer 3 的命令
- Layer 3 是业务逻辑的核心，处理所有数据流和状态管理
- Layer 4 是纯函数库，无状态，可独立测试

### 1.3 窗口类型设计

应用包含三种窗口，各自独立 HTML 入口和 Bundle：

| 窗口类型 | 用途 | 生命周期 |
|----------|------|----------|
| 主窗口 | 终端、SFTP、监控、AI 侧边栏 | 应用运行期间常驻 |
| 设置窗口 | 应用配置、AI 配置、快捷键 | 按需创建，关闭时销毁 |
| 审批窗口 | 危险命令确认、敏感操作 | 事件触发创建，完成后销毁 |

每个窗口独立 Bundle 的好处：设置窗口不加载终端依赖，审批窗口不加载任何业务模块，冷启动更快。

---

## 2. IPC 合约与模块通信

### 2.1 通信模型

前端与 Rust 后端之间采用 Tauri 的 Command 机制通信，分为两种模式：

**Request/Response 模式**：前端调用 Rust 命令，等待返回结果。

```
React UI  --[invoke("connect", {host, port, auth})]-->  Rust Backend
React UI  <--[Result<Session, Error>]--  Rust Backend
```

**Event 模式**：Rust 后端向前端推送事件，无需前端请求。

```
Rust Backend  --[emit("terminal_data", {session_id, data})]-->  React UI
Rust Backend  --[emit("connection_status", {id, status})]-->  React UI
```

### 2.2 命令注册

Rust 后端所有命令集中注册在 `src-tauri/src/commands/mod.rs`：

```rust
pub fn register_commands(app: &mut tauri::App) {
    // SSH 连接
    app.invoke_handler(tauri::generate_handler![
        commands::ssh::connect,
        commands::ssh::disconnect,
        commands::ssh::execute,
        commands::ssh::list_connections,
        commands::ssh::save_connection,
        commands::ssh::delete_connection,
        // SFTP
        commands::sftp::list_dir,
        commands::sftp::upload_file,
        commands::sftp::download_file,
        commands::sftp::delete_file,
        commands::sftp::rename_file,
        commands::sftp::mkdir,
        commands::sftp::chmod,
        // 监控
        commands::monitor::get_cpu_usage,
        commands::monitor::get_memory_usage,
        commands::monitor::get_disk_usage,
        commands::monitor::get_network_usage,
        commands::monitor::get_process_list,
        commands::monitor::kill_process,
        // AI
        commands::ai::chat,
        commands::ai::nl_to_command,
        commands::ai::analyze_error,
        commands::ai::test_connection,
        commands::ai::save_config,
        commands::ai::list_configs,
        // 端口转发
        commands::tunnel::create_local,
        commands::tunnel::create_remote,
        commands::tunnel::create_dynamic,
        commands::tunnel::list_tunnels,
        commands::tunnel::close_tunnel,
        // 审计
        commands::audit::log_event,
        commands::audit::query_logs,
        commands::audit::export_logs,
        // 配置
        commands::config::get,
        commands::config::set,
        commands::config::export_all,
        commands::config::import_all,
    ]);
}
```

### 2.3 前端类型生成

前端 TypeScript 类型从 Rust 命令自动推导，不手写：

```typescript
// src/types/commands.ts
// 由 tauri-api 生成，或手动维护与 Rust 侧一致的类型
import { invoke } from '@tauri-apps/api/core';

// Request/Response 调用封装
async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args);
}

// 类型安全的命令调用
export const ssh = {
  connect: (args: ConnectArgs) => command<SessionInfo>('connect', args),
  disconnect: (id: string) => command<void>('disconnect', { id }),
  execute: (id: string, cmd: string) => command<CommandResult>('execute', { id, cmd }),
};

export const sftp = {
  listDir: (sessionId: string, path: string) => command<FileEntry[]>('list_dir', { sessionId, path }),
  uploadFile: (args: UploadArgs) => command<void>('upload_file', args),
};
```

### 2.4 事件监听

前端通过 `listen` 监听 Rust 后端推送的事件：

```typescript
import { listen } from '@tauri-apps/api/event';

// 监听终端输出
listen<TerminalData>('terminal_data', (event) => {
  terminal.write(event.payload.data);
});

// 监听连接状态变化
listen<ConnectionStatus>('connection_status', (event) => {
  updateConnectionInList(event.payload);
});

// 监听 AI 流式输出
listen<AIChunk>('ai_stream', (event) => {
  appendToAIMessage(event.payload);
});
```

---

## 3. SSH 连接管理模块设计

### 3.1 数据模型

```rust
// src-tauri/src/models/connection.rs

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub id: String,                    // UUID
    pub name: String,                  // 显示名称
    pub group: String,                 // 所属分组
    pub host: String,                  // 主机地址
    pub port: u16,                     // 端口号，默认 22
    pub auth: AuthMethod,              // 认证方式
    pub username: String,              // 用户名
    pub keepalive_interval: u32,       // 保活间隔（秒），默认 60
    pub timeout: u32,                  // 连接超时（秒），默认 10
    pub encoding: String,              // 字符编码，默认 UTF-8
    pub terminal_type: String,         // 终端类型，默认 xterm-256color
    pub proxy: Option<ProxyConfig>,    // 代理配置
    pub tags: Vec<String>,             // 标签
    pub notes: String,                 // 备注
    pub created_at: DateTime<Utc>,     // 创建时间
    pub updated_at: DateTime<Utc>,     // 更新时间
    pub last_connected_at: Option<DateTime<Utc>>,  // 最后连接时间
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AuthMethod {
    Password { password: SecureString },
    KeyFile { key_path: String, passphrase: Option<SecureString> },
    Certificate { cert_path: String, key_path: String },
    KeyboardInteractive,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProxyConfig {
    pub proxy_type: ProxyType,         // HTTP / SOCKS5
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<SecureString>,
}
```

### 3.2 连接池设计

```rust
// src-tauri/src/ssh/pool.rs

pub struct ConnectionPool {
    // 活跃连接：session_id -> SshSession
    active: HashMap<String, SshSession>,
    // 连接配置缓存
    configs: HashMap<String, ConnectionConfig>,
    // 空闲连接队列：config_id -> 空闲 session
    idle: HashMap<String, Vec<SshSession>>,
    // 连接统计
    stats: HashMap<String, ConnectionStats>,
    // 配置
    max_idle_per_config: usize,        // 每个配置最大空闲连接数，默认 3
    idle_timeout: Duration,            // 空闲超时，默认 5 分钟
}

pub struct ConnectionStats {
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub latency_ms: f64,
    pub connected_since: DateTime<Utc>,
    pub reconnect_count: u32,
}

impl ConnectionPool {
    // 获取或创建连接
    pub async fn get_or_create(&mut self, config: &ConnectionConfig) -> Result<String, SshError> {
        // 1. 先检查空闲连接池
        if let Some(idle_sessions) = self.idle.get_mut(&config.id) {
            if let Some(session) = idle_sessions.pop() {
                // 验证连接是否仍然存活
                if session.is_alive().await {
                    let session_id = session.id.clone();
                    self.active.insert(session_id.clone(), session);
                    return Ok(session_id);
                }
            }
        }
        // 2. 没有可用空闲连接，创建新连接
        let session = SshSession::connect(config).await?;
        let session_id = session.id.clone();
        self.active.insert(session_id.clone(), session);
        self.stats.insert(session_id.clone(), ConnectionStats::default());
        Ok(session_id)
    }

    // 归还连接到空闲池
    pub async fn release(&mut self, session_id: &str) {
        if let Some(session) = self.active.remove(session_id) {
            let config_id = session.config_id.clone();
            self.idle.entry(config_id).or_default().push(session);
        }
    }

    // 定期清理空闲连接
    pub async fn cleanup_idle(&mut self) {
        let now = Utc::now();
        for (config_id, sessions) in &mut self.idle {
            sessions.retain(|s| {
                now.signed_duration_since(s.last_active) < chrono::Duration::from_std(self.idle_timeout).unwrap()
            });
        }
    }
}
```

### 3.3 自动重连机制

```rust
pub struct ReconnectPolicy {
    pub max_attempts: u32,          // 最大重连次数，默认 5
    pub initial_delay: Duration,    // 首次重连延迟，默认 1s
    pub max_delay: Duration,        // 最大重连延迟，默认 30s
    pub backoff_factor: f64,        // 退避因子，默认 2.0
}

impl ReconnectPolicy {
    pub fn next_delay(&self, attempt: u32) -> Duration {
        let delay_secs = self.initial_delay.as_secs_f64()
            * self.backoff_factor.powi(attempt as i32);
        Duration::from_secs_f64(delay_secs.min(self.max_delay.as_secs_f64()))
    }
}
```

重连流程：

```
连接断开
  |
  v
检查重连策略 (是否启用 / 次数限制)
  |
  v (允许重连)
计算延迟 (指数退避)
  |
  v (延迟后)
尝试重连
  |
  +-- 成功 --> 恢复会话，通知前端
  |
  +-- 失败 --> 递增计数，重新计算延迟
  |
  +-- 超过最大次数 --> 标记连接失败，通知前端
```

### 3.4 连接配置持久化

使用 `tauri-plugin-store` 存储连接配置，敏感信息（密码、密钥口令）通过 `tauri-plugin-keyring` 存储到 OS 密钥环：

```rust
// 存储流程
pub async fn save_connection(config: &ConnectionConfig) -> Result<(), AppError> {
    // 1. 提取敏感字段
    let sensitive = extract_sensitive_fields(config);

    // 2. 将敏感信息写入 OS 密钥环
    keyring::Entry::new("russh", &config.id)?
        .set_password(&serde_json::to_string(&sensitive)?)?;

    // 3. 将非敏感配置写入 store
    let clean_config = config.without_sensitive();
    store.set(&config.id, clean_config)?;

    Ok(())
}
```

---

## 4. 终端渲染模块设计

### 4.1 Xterm.js 集成

前端终端渲染基于 Xterm.js v5.3，通过 addons 扩展能力：

```typescript
// src/components/Terminal.tsx

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';

function createTerminal(config: TerminalConfig): Terminal {
  const term = new Terminal({
    fontFamily: config.fontFamily || '"JetBrains Mono", "Fira Code", monospace',
    fontSize: config.fontSize || 14,
    lineHeight: config.lineHeight || 1.5,
    theme: config.theme,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    allowProposedApi: true,
    // 原生感：禁用终端内的链接预览
    linkHandler: null,
  });

  // 加载 addons
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new SearchAddon());
  term.loadAddon(new WebLinksAddon());

  // 尝试 WebGL 渲染（性能更好）
  try {
    term.loadAddon(new WebglAddon());
  } catch {
    // WebGL 不可用时回退到 Canvas
  }

  return term;
}
```

### 4.2 终端数据桥

Rust 后端通过 SSH 会话收发终端数据，前端通过 Tauri 事件机制传递：

```
用户键盘输入
  |
  v
Xterm.js onData 事件
  |
  v
前端 invoke("ssh_write", { session_id, data })
  |
  v
Rust: session.channel.data(&data)
  |
  v
SSH 服务器处理
  |
  v
SSH 服务器返回输出
  |
  v
Rust: emit("terminal_data", { session_id, data })
  |
  v
前端: listen("terminal_data") -> terminal.write(data)
```

Rust 端实现：

```rust
// src-tauri/src/commands/ssh.rs

#[tauri::command]
pub async fn ssh_write(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), AppError> {
    let mut pool = state.pool.lock().await;
    let session = pool.get_active_mut(&session_id)?;
    session.channel.send_data(data.as_bytes()).await?;
    Ok(())
}

// 终端输出监听任务
async fn spawn_output_listener(
    session: SshSession,
    app_handle: AppHandle,
) {
    let session_id = session.id.clone();
    let mut receiver = session.output_receiver;

    tokio::spawn(async move {
        while let Some(data) = receiver.recv().await {
            let _ = app_handle.emit("terminal_data", TerminalData {
                session_id: session_id.clone(),
                data: String::from_utf8_lossy(&data).to_string(),
            });
        }
    });
}
```

### 4.3 多标签页管理

```typescript
// src/stores/terminal-store.ts

interface TabState {
  id: string;                    // 标签页 ID
  session_id: string | null;     // SSH 会话 ID，null 表示未连接
  title: string;                 // 标签页标题
  type: 'terminal' | 'sftp' | 'monitor';  // 标签页类型
  is_active: boolean;            // 是否当前活跃
  split_parent?: string;         // 分屏父标签 ID
  split_direction?: 'horizontal' | 'vertical';
}

// 标签页操作
const tabActions = {
  createTab(type: TabState['type']): string {
    const id = generateId();
    // 创建新标签页
    // 如果有活跃标签页，默认在其右侧创建
    // 返回新标签页 ID
    return id;
  },

  closeTab(id: string) {
    // 1. 如果有关联的 SSH 会话，断开连接
    // 2. 销毁终端实例
    // 3. 切换到相邻标签页
    // 4. 如果是最后一个标签页，关闭窗口
  },

  moveTab(fromIndex: number, toIndex: number) {
    // 拖拽排序
  },

  splitTab(id: string, direction: 'horizontal' | 'vertical') {
    // 分屏：创建新标签页，共享同一 SSH 会话
  },
};
```

### 4.4 终端主题系统

内置 5 套主题，每套包含完整的 16 色 ANSI 调色板：

```typescript
// src/themes/terminal-themes.ts

export const themes: Record<string, TerminalTheme> = {
  ink: {
    name: '墨',
    colors: {
      background: '#111113',
      foreground: '#fafafa',
      cursor: '#f59e0b',
      cursorAccent: '#111113',
      selectionBackground: 'rgba(245, 158, 11, 0.2)',
      black: '#18181b',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#eab308',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#fafafa',
      brightBlack: '#52525b',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#facc15',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff',
    },
    // 浅色 ANSI 色（低强度）
    brightColors: { /* ... */ },
  },
  paper: { /* 浅色主题 */ },
  abyss: { /* 纯黑主题 */ },
  dusk: { /* 暖灰主题 */ },
  aurora: { /* 深蓝主题 */ },
};
```

用户可自定义主题，导入导出为 JSON 文件。

### 4.5 终端搜索

通过 Xterm.js 的 SearchAddon 实现：

```typescript
// 搜索功能
const searchAddon = new SearchAddon();

// Cmd+F 打开搜索栏
// 支持正则表达式
// 高亮所有匹配项
// 上一个/下一个导航
// 搜索结果计数显示
```

### 4.6 终端复制粘贴

```typescript
// 复制：选中文本后 Cmd+C 直接复制到系统剪贴板
// 粘贴：Cmd+V 从系统剪贴板粘贴到终端
// 右键菜单：粘贴、复制、搜索、清屏

// 注意：禁用浏览器默认的右键菜单，使用自定义菜单
terminal.attachCustomKeyEvent((event: KeyboardEvent) => {
  if (event.key === 'c' && (event.metaKey || event.ctrlKey) && terminal.hasSelection()) {
    // 复制选中文本到剪贴板
    navigator.clipboard.writeText(terminal.getSelection());
  }
});
```

---

## 5. SFTP 文件管理模块设计

### 5.1 数据模型

```rust
// src-tauri/src/models/sftp.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,              // 文件名
    pub path: String,              // 完整路径
    pub is_dir: bool,              // 是否目录
    pub size: u64,                 // 文件大小（字节）
    pub permissions: String,       // 权限字符串 (如 "rwxr-xr-x")
    pub owner: String,             // 所有者
    pub group: String,             // 所属组
    pub modified_at: DateTime<Utc>,// 修改时间
    pub is_symlink: bool,          // 是否符号链接
    pub symlink_target: Option<String>, // 符号链接目标
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransferTask {
    pub id: String,                // 任务 ID
    pub direction: TransferDirection, // Upload / Download
    pub local_path: String,
    pub remote_path: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub status: TransferStatus,    // Pending / Transferring / Completed / Failed / Cancelled
    pub speed_bytes_per_sec: f64,
    pub error: Option<String>,
}

pub enum TransferStatus {
    Pending,
    Transferring,
    Completed,
    Failed(String),
    Cancelled,
}
```

### 5.2 文件浏览实现

```rust
#[tauri::command]
pub async fn sftp_list_dir(
    state: State<'_, AppState>,
    session_id: String,
    path: String,
) -> Result<Vec<FileEntry>, AppError> {
    let pool = state.pool.lock().await;
    let session = pool.get_active(&session_id)?;
    let sftp = session.sftp_channel.as_ref().ok_or(AppError::NoSftpChannel)?;

    let mut entries = Vec::new();
    let mut dir = sftp.readdir(&PathBuf::from(&path)).await?;

    while let Some(entry) = dir.next().await {
        let entry = entry?;
        entries.push(FileEntry::from(entry));
    }

    // 排序：目录在前，按名称字母序
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
```

### 5.3 文件传输设计

传输采用流式处理，大文件分片传输，支持断点续传：

```rust
pub struct FileTransfer {
    chunk_size: usize,           // 分片大小，默认 64KB
    buffer_pool: Arc<BufferPool>, // 缓冲区池，复用内存
}

impl FileTransfer {
    pub async fn upload(
        &self,
        local_path: &Path,
        remote_path: &Path,
        progress_callback: impl Fn(u64, u64) + Send + 'static,
    ) -> Result<(), TransferError> {
        let file = File::open(local_path).await?;
        let total_size = file.metadata().await?.len();
        let mut uploaded = 0u64;

        let mut remote_file = sftp.create(remote_path).await?;

        loop {
            let buf = self.buffer_pool.get(self.chunk_size);
            let n = file.read(&mut buf).await?;
            if n == 0 { break; }

            remote_file.write_all(&buf[..n]).await?;
            uploaded += n as u64;
            progress_callback(uploaded, total_size);
        }

        remote_file.flush().await?;
        Ok(())
    }

    pub async fn download(
        &self,
        remote_path: &Path,
        local_path: &Path,
        progress_callback: impl Fn(u64, u64) + Send + 'static,
    ) -> Result<(), TransferError> {
        let remote_file = sftp.open(remote_path).await?;
        let total_size = remote_file.metadata().await?.len();
        let mut downloaded = 0u64;

        let mut local_file = File::create(local_path).await?;

        loop {
            let buf = self.buffer_pool.get(self.chunk_size);
            let n = remote_file.read(&mut buf).await?;
            if n == 0 { break; }

            local_file.write_all(&buf[..n]).await?;
            downloaded += n as u64;
            progress_callback(downloaded, total_size);
        }

        local_file.flush().await?;
        Ok(())
    }
}
```

### 5.4 传输队列管理

```rust
pub struct TransferQueue {
    tasks: VecDeque<TransferTask>,
    max_concurrent: usize,          // 最大并发传输数，默认 3
    active_count: usize,
}

impl TransferQueue {
    pub async fn enqueue(&mut self, task: TransferTask) {
        self.tasks.push_back(task);
        self.process_next().await;
    }

    async fn process_next(&mut self) {
        while self.active_count < self.max_concurrent {
            if let Some(task) = self.tasks.pop_front() {
                self.active_count += 1;
                self.start_transfer(task).await;
            } else {
                break;
            }
        }
    }

    pub async fn cancel(&mut self, task_id: &str) {
        // 取消指定任务
        // 如果正在传输中，关闭文件句柄
    }
}
```

### 5.5 拖拽上传

前端通过 Tauri 的拖拽事件接收本地文件路径，然后调用上传命令：

```typescript
// 监听拖拽事件
import { listen } from '@tauri-apps/api/event';

listen<DragDropPayload>('tauri://drag-drop', async (event) => {
  const files = event.payload.paths;
  for (const filePath of files) {
    await invoke('sftp_upload_file', {
      sessionId: currentSessionId,
      localPath: filePath,
      remotePath: currentRemotePath + '/' + basename(filePath),
    });
  }
});
```

---

## 6. 系统资源监控模块设计

### 6.1 数据采集

通过 SSH 在远程服务器执行监控命令获取数据，后端解析输出：

```rust
pub struct MonitorService {
    // 每个会话的监控任务句柄
    tasks: HashMap<String, JoinHandle<()>>,
    // 采样间隔
    interval: Duration,
}

impl MonitorService {
    // CPU 使用率：解析 /proc/stat 或使用 top 命令
    pub async fn get_cpu_usage(session: &SshSession) -> Result<CpuInfo, AppError> {
        let output = session.execute("top -bn1 | head -5").await?;
        // 解析输出，提取 CPU 使用率
        Ok(CpuInfo {
            user: parsed.user,
            system: parsed.system,
            idle: parsed.idle,
            total: parsed.total,
        })
    }

    // 内存使用率：解析 /proc/meminfo
    pub async fn get_memory_usage(session: &SshSession) -> Result<MemoryInfo, AppError> {
        let output = session.execute("free -b").await?;
        Ok(MemoryInfo {
            total: parsed.total,
            used: parsed.used,
            free: parsed.free,
            available: parsed.available,
            swap_total: parsed.swap_total,
            swap_used: parsed.swap_used,
        })
    }

    // 磁盘使用率：解析 df 输出
    pub async fn get_disk_usage(session: &SshSession) -> Result<Vec<DiskInfo>, AppError> {
        let output = session.execute("df -B1 --output=source,size,used,avail,pcent,target").await?;
        // 解析每行，过滤掉 tmpfs 等虚拟文件系统
        Ok(parsed_disks)
    }

    // 网络流量：解析 /proc/net/dev
    pub async fn get_network_usage(session: &SshSession) -> Result<Vec<NetworkInfo>, AppError> {
        let output = session.execute("cat /proc/net/dev").await?;
        // 解析网络接口流量
        Ok(parsed_interfaces)
    }

    // 进程列表：解析 ps 输出
    pub async fn get_process_list(
        session: &SshSession,
        sort_by: &str,        // cpu / mem / pid
        limit: usize,
    ) -> Result<Vec<ProcessInfo>, AppError> {
        let cmd = format!("ps aux --sort=-{} | head -{}", sort_by, limit + 1);
        let output = session.execute(&cmd).await?;
        Ok(parsed_processes)
    }
}
```

### 6.2 前端监控面板

```typescript
// src/components/MonitorPanel.tsx

// 监控面板由多个可折叠卡片组成
// 每个卡片显示一个指标的实时数据和历史趋势

function MonitorPanel({ sessionId }: { sessionId: string }) {
  const [cpu, setCpu] = useState<CpuInfo>();
  const [memory, setMemory] = useState<MemoryInfo>();
  const [disks, setDisks] = useState<DiskInfo[]>();
  const [network, setNetwork] = useState<NetworkInfo[]>();
  const [processes, setProcesses] = useState<ProcessInfo[]>();

  // 定时刷新（默认 2 秒间隔）
  useEffect(() => {
    const interval = setInterval(async () => {
      const [cpuData, memData, diskData, netData] = await Promise.all([
        invoke('monitor_get_cpu_usage', { sessionId }),
        invoke('monitor_get_memory_usage', { sessionId }),
        invoke('monitor_get_disk_usage', { sessionId }),
        invoke('monitor_get_network_usage', { sessionId }),
      ]);
      setCpu(cpuData);
      setMemory(memData);
      setDisks(diskData);
      setNetwork(netData);
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <div className="monitor-panel">
      <CpuCard data={cpu} />
      <MemoryCard data={memory} />
      <DiskCard data={disks} />
      <NetworkCard data={network} />
      <ProcessCard data={processes} sessionId={sessionId} />
    </div>
  );
}
```

### 6.3 历史趋势图

使用 SVG 绘制，无外部依赖：

```typescript
// src/components/TrendChart.tsx

function TrendChart({ data, color, unit, max }: TrendChartProps) {
  // data: 最近 N 个采样点的值
  // 使用 SVG path 绘制折线
  // 填充使用半透明色
  // X 轴显示时间标签
  // Y 轴显示数值刻度
  // hover 时显示精确数值

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - (d.value / max) * height,
  }));

  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={buildAreaPath(points)} fill={`url(#grad-${color})`} />
      <path d={buildLinePath(points)} stroke={color} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
```

### 6.4 进程管理

```typescript
// 进程列表支持按列排序
// 点击列头切换升序/降序
// 右键进程可结束进程（发送 SIGTERM/SIGKILL）

async function killProcess(sessionId: string, pid: number, signal: string) {
  await invoke('monitor_kill_process', { sessionId, pid, signal });
}
```

---

## 7. 网络工具模块设计

### 7.1 端口转发

```rust
pub struct TunnelManager {
    tunnels: HashMap<String, TunnelInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TunnelInfo {
    pub id: String,
    pub tunnel_type: TunnelType,
    pub local_host: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub session_id: String,       // 关联的 SSH 会话
    pub status: TunnelStatus,
}

pub enum TunnelType {
    Local,    // -L: 本地端口转发
    Remote,   // -R: 远程端口转发
    Dynamic,  // -D: 动态端口转发 (SOCKS5)
}

// 本地端口转发：在本地监听端口，流量通过 SSH 转发到远程
#[tauri::command]
pub async fn tunnel_create_local(
    state: State<'_, AppState>,
    session_id: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> Result<String, AppError> {
    let pool = state.pool.lock().await;
    let session = pool.get_active(&session_id)?;

    // 在本地启动 TCP 监听
    let listener = TcpListener::bind(format!("127.0.0.1:{}", local_port)).await?;

    // 每个连接建立一个 SSH 端口转发通道
    let tunnel_id = generate_id();
    tokio::spawn(async move {
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            let channel = session.open_tcp_forward(&remote_host, remote_port).await;
            tokio::spawn(async move {
                // 双向数据转发
                let (mut reader, mut writer) = stream.into_split();
                let (mut ssh_reader, mut ssh_writer) = channel.into_split();
                tokio::select! {
                    _ = tokio::io::copy(&mut reader, &mut ssh_writer) => {},
                    _ = tokio::io::copy(&mut ssh_reader, &mut writer) => {},
                }
            });
        }
    });

    Ok(tunnel_id)
}
```

### 7.2 隧道管理界面

前端提供图形化的隧道管理面板：

```
+-----------------------------------------------------------+
|  端口转发管理                                      [+ 新建] |
+-----------------------------------------------------------+
|  类型    本地端口    远程目标             状态    操作      |
|  --------------------------------------------------------|
|  本地    3306       db-server:3306      运行中  [停止][X] |
|  远程    8080       0.0.0.0:8080        运行中  [停止][X] |
|  动态    1080       -                    已停止  [启动][X] |
+-----------------------------------------------------------+
|  传输统计: 上行 2.3 GB  下行 890 MB  运行时间 2h 15m      |
+-----------------------------------------------------------+
```

### 7.3 网络诊断工具

```rust
// 内置网络诊断命令，通过 SSH 在远程执行
pub struct NetDiagnostics;

impl NetDiagnostics {
    pub async fn ping(session: &SshSession, host: &str, count: u32) -> Result<PingResult, AppError> {
        let cmd = format!("ping -c {} {}", count, host);
        let output = session.execute(&cmd).await?;
        Ok(PingResult::parse(&output))
    }

    pub async fn traceroute(session: &SshSession, host: &str) -> Result<Vec<TracerouteHop>, AppError> {
        let cmd = format!("traceroute -n {}", host);
        let output = session.execute(&cmd).await?;
        Ok(TracerouteHop::parse_all(&output))
    }

    pub async fn port_scan(session: &SshSession, host: &str, ports: &[u16]) -> Result<Vec<PortStatus>, AppError> {
        // 使用 bash 的 /dev/tcp 进行端口扫描
        let mut results = Vec::new();
        for port in ports {
            let cmd = format!("(echo >/dev/tcp/{}/{}) 2>/dev/null && echo open || echo closed", host, port);
            let output = session.execute(&cmd).await?;
            results.push(PortStatus { port, is_open: output.contains("open") });
        }
        Ok(results)
    }
}
```

---

## 8. 运维工具模块设计

### 8.1 批量命令执行

```rust
pub struct BatchExecutor {
    // 并发控制
    max_concurrent: usize,
}

impl BatchExecutor {
    pub async fn execute(
        &self,
        session_ids: Vec<String>,
        command: String,
        state: State<'_, AppState>,
    ) -> Vec<BatchResult> {
        let semaphore = Arc::new(Semaphore::new(self.max_concurrent));
        let mut handles = Vec::new();

        for session_id in session_ids {
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let state_clone = state.clone();
            let cmd = command.clone();

            handles.push(tokio::spawn(async move {
                let result = {
                    let pool = state_clone.pool.lock().await;
                    if let Some(session) = pool.get_active(&session_id) {
                        session.execute(&cmd).await
                    } else {
                        Err(AppError::SessionNotFound)
                    }
                };
                drop(permit); // 释放信号量
                BatchResult { session_id, result }
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            results.push(handle.await.unwrap());
        }
        results
    }
}
```

前端批量执行面板：

```
+-----------------------------------------------------------+
|  批量命令执行                                              |
+-----------------------------------------------------------+
|  目标服务器:                                               |
|  [x] prod-web-01   [x] prod-web-02   [ ] staging-01      |
|  [x] prod-db-01     [ ] dev-server                                  |
|                                                           |
|  命令:                                                     |
|  +------------------------------------------------------+ |
|  | df -h && free -m && uptime                            | |
|  +------------------------------------------------------+ |
|                                                           |
|  [执行]  已选择 3 台服务器                                  |
+-----------------------------------------------------------+
|  执行结果:                                                  |
|  prod-web-01:  /dev/sda1  45G  12G  31G  28%             |
|  prod-web-02:  /dev/sda1  45G  15G  28G  35%             |
|  prod-db-01:   /dev/sda1 200G  89G 101G  47%             |
+-----------------------------------------------------------+
```

### 8.2 脚本收藏

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct ScriptEntry {
    pub id: String,
    pub name: String,
    pub content: String,            // 脚本内容
    pub language: ScriptLanguage,   // Shell / Python / Perl
    pub category: String,           // 分类
    pub parameters: Vec<ScriptParam>, // 参数定义
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub use_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScriptParam {
    pub name: String,
    pub description: String,
    pub param_type: ParamType,     // String / Number / Boolean / Path
    pub default_value: Option<String>,
    pub required: bool,
}

// 参数化执行
pub async fn execute_script(
    session: &SshSession,
    script: &ScriptEntry,
    params: HashMap<String, String>,
) -> Result<String, AppError> {
    let mut content = script.content.clone();

    // 替换参数占位符
    for (key, value) in &params {
        content = content.replace(&format!("${{{}}}", key), value);
    }

    // 根据语言选择解释器
    let cmd = match script.language {
        ScriptLanguage::Shell => format!("bash -c '{}'", content.replace('\'', "'\\''")),
        ScriptLanguage::Python => format!("python3 -c '{}'", content.replace('\'', "'\\''")),
        ScriptLanguage::Perl => format!("perl -e '{}'", content.replace('\'', "'\\''")),
    };

    session.execute(&cmd).await
}
```

### 8.3 会话记录与回放

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: String,
    pub session_id: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub events: Vec<SessionEvent>,    // 终端事件列表
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionEvent {
    pub timestamp: DateTime<Utc>,
    pub event_type: EventType,        // Input / Output / Resize
    pub data: String,
}

// 录制：拦截终端输入输出，保存到本地文件
// 回放：按时间戳顺序重放事件，支持暂停、快进、快退
// 搜索：在事件列表中搜索特定命令或输出
```

### 8.4 快捷命令

```typescript
// 快捷命令面板：固定在终端下方或侧边栏
// 支持分类：常用、数据库、Docker、Git 等
// 点击即执行，支持组合命令

interface QuickCommand {
  id: string;
  name: string;
  command: string;
  category: string;
  icon: string;       // 使用 Unicode 字符或 SVG 图标
  shortcut?: string;  // 键盘快捷键
}
```

---

## 9. AI 功能模块设计

### 9.1 AI 服务架构

基于 rig 框架构建，采用模型无关设计：

```
+-----------------------------------------------------------+
|  AI Service Layer                                          |
|  +-------------+  +-------------+  +-------------+        |
|  | ConfigMgr   |  | ModelAdapter|  | PromptEngine|        |
|  | (UserCfg)   |  | (MultiModel)|  | (Templates) |        |
|  +-------------+  +-------------+  +-------------+        |
|  +-------------+  +-------------+  +-------------+        |
|  | ToolCall    |  | SafetySandbox|  | AuditSystem|        |
|  | (RigNative) |  | (CmdCheck)  |  | (OpLog)     |        |
|  +-------------+  +-------------+  +-------------+        |
+-----------------------------------------------------------+
```

### 9.2 AI 配置管理

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct AiConfig {
    pub id: String,
    pub name: String,                    // 配置名称，如 "OpenAI GPT-4o"
    pub provider: AiProvider,            // 服务提供商类型
    pub base_url: String,               // API 地址
    pub api_key: SecureString,           // API 密钥（加密存储）
    pub model: String,                  // 模型名称
    pub temperature: f32,               // 温度参数 0.0-1.0
    pub max_tokens: u32,                // 最大 token 数
    pub timeout_secs: u32,              // 超时时间
    pub created_at: DateTime<Utc>,
}

pub enum AiProvider {
    OpenAICompatible,   // OpenAI 兼容 API
    OllamaLocal,        // Ollama 本地服务
}
```

配置存储流程与 SSH 连接配置一致：非敏感信息存 store，API Key 存 OS 密钥环。

### 9.3 自然语言转命令

```rust
pub struct NlToCommandService {
    // 系统提示词：告诉 AI 它是一个 SSH 命令助手
    system_prompt: String,
}

impl NlToCommandService {
    pub async fn convert(
        &self,
        user_input: &str,
        context: &CommandContext,   // 当前服务器 OS、已执行的命令等
        config: &AiConfig,
    ) -> Result<AiCommandResult, AppError> {
        // 1. 构建包含上下文的提示词
        let prompt = self.build_prompt(user_input, context);

        // 2. 调用 AI 模型
        let response = rig::completion(&config, &self.system_prompt, &prompt).await?;

        // 3. 解析 AI 响应，提取命令
        let command = extract_command(&response)?;

        // 4. 安全预检
        let risk_level = safety_sandbox::check_risk(&command, context);

        Ok(AiCommandResult {
            command,
            explanation: response,
            risk_level,
        })
    }

    fn build_prompt(&self, user_input: &str, context: &CommandContext) -> String {
        format!(
            "当前服务器操作系统: {os}\n\
             当前工作目录: {cwd}\n\
             用户需求: {input}\n\n\
             请生成一个可以在当前服务器上执行的 Shell 命令。\
             只返回命令本身，不需要解释。",
            os = context.os_type,
            cwd = context.current_dir,
            input = user_input,
        )
    }
}
```

### 9.4 错误自动分析

```rust
pub struct ErrorAnalyzerService;

impl ErrorAnalyzerService {
    pub async fn analyze(
        &self,
        command: &str,
        exit_code: i32,
        stderr: &str,
        config: &AiConfig,
    ) -> Result<ErrorAnalysis, AppError> {
        let prompt = format!(
            "用户在 Linux 服务器上执行了以下命令：\n\
             命令: {cmd}\n\
             退出码: {code}\n\
             错误输出:\n{err}\n\n\
             请分析错误原因，并给出修复建议。\
             如果需要修复命令，用 ```bash ``` 代码块包裹。",
            cmd = command,
            code = exit_code,
            err = stderr,
        );

        let response = rig::completion(config, SYSTEM_PROMPT, &prompt).await?;

        Ok(ErrorAnalysis {
            error_description: extract_description(&response),
            fix_suggestion: extract_fix_command(&response),
            confidence: calculate_confidence(&response),
        })
    }
}
```

### 9.5 智能命令补全

```rust
pub struct SmartCompleter {
    // 命令历史缓存
    history_cache: Vec<String>,
    // 上下文窗口大小
    context_window: usize,
}

impl SmartCompleter {
    pub async fn complete(
        &self,
        partial_input: &str,
        session: &SshSession,
        config: &AiConfig,
    ) -> Result<Vec<CompletionSuggestion>, AppError> {
        // 1. 优先匹配本地历史命令
        let local_matches: Vec<_> = self.history_cache.iter()
            .filter(|cmd| cmd.starts_with(partial_input))
            .take(5)
            .map(|cmd| CompletionSuggestion {
                text: cmd.clone(),
                source: CompletionSource::History,
            })
            .collect();

        // 2. 如果本地匹配不足，调用 AI 补全
        if local_matches.len() < 5 {
            let prompt = format!(
                "用户正在输入: {}\n\
                 最近执行的命令: {}\n\
                 服务器 OS: {}\n\n\
                 请提供 5 个可能的命令补全建议，每行一个。",
                partial_input,
                self.recent_commands().join("; "),
                session.os_type,
            );
            let response = rig::completion(config, SYSTEM_PROMPT, &prompt).await?;
            let ai_suggestions = parse_suggestions(&response);
            local_matches.extend(ai_suggestions);
        }

        Ok(local_matches)
    }
}
```

### 9.6 AI 会话总结

```rust
pub async fn summarize_session(
    session: &SshSession,
    events: &[SessionEvent],
    config: &AiConfig,
) -> Result<SessionSummary, AppError> {
    // 构建会话摘要提示词
    let command_log = events.iter()
        .filter(|e| e.event_type == EventType::Input)
        .map(|e| e.data.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        "以下是一个 SSH 会话的命令执行记录：\n\n{commands}\n\n\
         请生成一份结构化的会话摘要，包括：\n\
         1. 执行了哪些主要操作\n\
         2. 遇到了哪些问题\n\
         3. 操作结果总结",
        commands = command_log,
    );

    let response = rig::completion(config, SYSTEM_PROMPT, &prompt).await?;

    Ok(SessionSummary {
        content: response,
        generated_at: Utc::now(),
        command_count: events.len(),
    })
}
```

### 9.7 AI 工具调用系统

基于 rig 的 tool calling 能力，定义以下工具供 AI 调用：

```rust
// 定义 AI 可用的工具
pub fn define_tools() -> Vec<rig::Tool> {
    vec![
        rig::Tool::new(
            "execute_command",
            "在远程服务器上执行 Shell 命令",
            ExecuteCommandParams {
                command: String,    // 要执行的命令
                session_id: String, // 目标会话
            },
        ),
        rig::Tool::new(
            "read_file",
            "读取远程服务器上的文件内容",
            ReadFileParams {
                path: String,
                session_id: String,
            },
        ),
        rig::Tool::new(
            "get_system_info",
            "获取远程服务器的系统信息",
            GetSystemInfoParams {
                session_id: String,
                info_type: String,  // cpu / memory / disk / process
            },
        ),
        rig::Tool::new(
            "list_processes",
            "查看远程服务器的进程列表",
            ListProcessesParams {
                session_id: String,
                sort_by: Option<String>,
            },
        ),
    ]
}
```

所有工具调用都必须经过安全沙箱检查（见第 10 节）。

---

## 10. 安全体系设计

### 10.1 危险命令拦截引擎

```rust
pub struct CommandSafetyChecker {
    rules: Vec<SafetyRule>,
    default_level: RiskLevel,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SafetyRule {
    pub pattern: String,           // 正则表达式模式
    pub risk_level: RiskLevel,     // 风险等级
    pub description: String,       // 风险描述
    pub enabled: bool,
}

pub enum RiskLevel {
    Forbidden,   // 绝对禁止，不允许执行
    Approval,    // 需要人工审批
    Warning,     // 警告提示，可继续
    Safe,        // 安全，直接执行
}

impl CommandSafetyChecker {
    // 内置危险命令库
    fn builtin_rules() -> Vec<SafetyRule> {
        vec![
            // Forbidden - 绝对危险
            SafetyRule { pattern: r"rm\s+-rf\s+/?\s*".into(), risk_level: RiskLevel::Forbidden, description: "递归删除根目录".into(), enabled: true },
            SafetyRule { pattern: r"mkfs\.".into(), risk_level: RiskLevel::Forbidden, description: "格式化文件系统".into(), enabled: true },
            SafetyRule { pattern: r"dd\s+.*of=/dev/".into(), risk_level: RiskLevel::Forbidden, description: "写入磁盘设备".into(), enabled: true },
            SafetyRule { pattern: r":(){ :\|:& };:".into(), risk_level: RiskLevel::Forbidden, description: "fork 炸弹".into(), enabled: true },
            SafetyRule { pattern: r"chmod\s+777\s+/".into(), risk_level: RiskLevel::Forbidden, description: "开放根目录权限".into(), enabled: true },

            // Approval - 需要审批
            SafetyRule { pattern: r"rm\s+-rf\s+~".into(), risk_level: RiskLevel::Approval, description: "递归删除用户目录".into(), enabled: true },
            SafetyRule { pattern: r"shutdown\s+".into(), risk_level: RiskLevel::Approval, description: "关闭系统".into(), enabled: true },
            SafetyRule { pattern: r"reboot".into(), risk_level: RiskLevel::Approval, description: "重启系统".into(), enabled: true },
            SafetyRule { pattern: r"systemctl\s+(stop|disable)\s+".into(), risk_level: RiskLevel::Approval, description: "停止系统服务".into(), enabled: true },
            SafetyRule { pattern: r"iptables\s+-F".into(), risk_level: RiskLevel::Approval, description: "清空防火墙规则".into(), enabled: true },

            // Warning - 警告
            SafetyRule { pattern: r"sudo\s+".into(), risk_level: RiskLevel::Warning, description: "使用 sudo 提权".into(), enabled: true },
            SafetyRule { pattern: r"kill\s+-9\s+".into(), risk_level: RiskLevel::Warning, description: "强制终止进程".into(), enabled: true },
            SafetyRule { pattern: r"apt\s+(remove|purge)\s+".into(), risk_level: RiskLevel::Warning, description: "卸载软件包".into(), enabled: true },
        ]
    }

    // 检查命令风险等级
    pub fn check(&self, command: &str, context: &CommandContext) -> RiskLevel {
        let mut max_risk = RiskLevel::Safe;

        for rule in &self.rules {
            if !rule.enabled { continue; }

            if regex::Regex::new(&rule.pattern)
                .unwrap()
                .is_match(command)
            {
                // 上下文感知：在根目录执行 rm 风险更高
                let adjusted_risk = self.adjust_risk(&rule.risk_level, context);
                max_risk = max_risk.max(adjusted_risk);
            }
        }

        max_risk
    }
}
```

### 10.2 人工审批流程

```rust
// 前端审批弹窗
interface ApprovalDialog {
    command: string;
    risk_level: RiskLevel;
    risk_description: string;
    server_name: string;
    onApprove: () => void;
    onDeny: () => void;
}

// 审批流程：
// 1. AI 生成命令
// 2. SafetyChecker 检查风险
// 3. 如果是 Approval 级别，弹出审批弹窗
// 4. 显示命令内容、风险描述、目标服务器
// 5. 用户点击"执行"或"拒绝"
// 6. 记录审批结果到审计日志
```

审批弹窗设计：

```
+-----------------------------------------------------------+
|  命令审批                                         [X]      |
+-----------------------------------------------------------+
|                                                           |
|  目标服务器: prod-web-01 (192.168.1.100)                  |
|  风险等级: 高风险                                          |
|                                                           |
|  检测到的风险:                                             |
|  sudo systemctl stop nginx                                |
|  停止系统服务 - 可能导致网站不可访问                       |
|                                                           |
|  +------------------------------------------------------+ |
|  | sudo systemctl stop nginx                              | |
|  +------------------------------------------------------+ |
|                                                           |
|  [拒绝]                                          [执行]   |
+-----------------------------------------------------------+
```

### 10.3 操作审计系统

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub user: String,                  // 操作系统用户名
    pub event_type: AuditEventType,
    pub content: String,               // 操作内容
    pub result: AuditResult,
    pub client_ip: String,
    pub target_server: Option<String>,
    pub target_host: Option<String>,
    pub duration_ms: Option<u64>,
    pub hash: String,                  // 条目哈希，用于完整性校验
    pub prev_hash: Option<String>,     // 前一条记录的哈希（链式哈希）
}

pub enum AuditEventType {
    ConnectionCreated,    // 创建连接
    ConnectionDeleted,    // 删除连接
    ConnectionModified,   // 修改连接
    SessionStarted,       // 会话开始
    SessionEnded,         // 会话结束
    CommandExecuted,      // 命令执行
    CommandApproved,      // 命令审批
    CommandBlocked,       // 命令被拦截
    FileUploaded,         // 文件上传
    FileDownloaded,       // 文件下载
    FileDeleted,          // 文件删除
    AiRequest,            // AI 请求
    ConfigChanged,        // 配置修改
}

pub enum AuditResult {
    Success,
    Failed(String),
    Blocked(String),
}
```

审计日志存储使用 SQLite，确保不可篡改：

```rust
pub struct AuditStore {
    db: SqlitePool,
}

impl AuditStore {
    // 写入审计日志（追加，不可修改）
    pub async fn append(&self, entry: AuditEntry) -> Result<(), AppError> {
        // 计算哈希链
        let prev_hash = self.get_last_hash().await?;
        let entry = entry.with_chain_hash(prev_hash);

        sqlx::query("INSERT INTO audit_log (id, timestamp, user, event_type, content, result, ...) VALUES (?, ?, ?, ?, ?, ?, ...)")
            .bind(&entry.id)
            .bind(&entry.timestamp)
            .bind(&entry.user)
            .execute(&self.db)
            .await?;

        Ok(())
    }

    // 查询审计日志
    pub async fn query(&self, filter: AuditFilter) -> Result<Vec<AuditEntry>, AppError> {
        // 支持按时间范围、事件类型、服务器、结果筛选
        let mut query = String::from("SELECT * FROM audit_log WHERE 1=1");

        if let Some(start) = filter.start_time {
            query += &format!(" AND timestamp >= '{}'", start);
        }
        if let Some(event_type) = filter.event_type {
            query += &format!(" AND event_type = '{}'", event_type);
        }

        query += " ORDER BY timestamp DESC";
        query += &format!(" LIMIT {}", filter.limit.unwrap_or(100));

        Ok(sqlx::query_as(&query).fetch_all(&self.db).await?)
    }

    // 导出为 CSV
    pub async fn export_csv(&self, filter: AuditFilter, path: &Path) -> Result<(), AppError> {
        let entries = self.query(filter).await?;
        let mut writer = csv::Writer::from_path(path)?;
        for entry in entries {
            writer.serialize(entry)?;
        }
        writer.flush()?;
        Ok(())
    }

    // 验证日志完整性（检查哈希链）
    pub async fn verify_integrity(&self) -> Result<bool, AppError> {
        let entries: Vec<AuditEntry> = sqlx::query_as("SELECT * FROM audit_log ORDER BY timestamp ASC")
            .fetch_all(&self.db)
            .await?;

        for i in 1..entries.len() {
            if entries[i].prev_hash.as_ref() != Some(&entries[i-1].hash) {
                return Ok(false); // 哈希链断裂
            }
        }
        Ok(true)
    }
}
```

### 10.4 数据安全

```rust
// 敏感信息加密存储
pub struct SecureStore {
    keyring: keyring::Entry,
}

impl SecureStore {
    pub fn new(service: &str, account: &str) -> Result<Self, AppError> {
        Ok(Self {
            keyring: keyring::Entry::new(service, account)?,
        })
    }

    pub fn set_secret(&self, secret: &str) -> Result<(), AppError> {
        self.keyring.set_password(secret)?;
        Ok(())
    }

    pub fn get_secret(&self) -> Result<String, AppError> {
        Ok(self.keyring.get_password()?)
    }

    pub fn delete_secret(&self) -> Result<(), AppError> {
        self.keyring.delete_credential()?;
        Ok(())
    }
}

// AI 请求脱敏
pub fn sanitize_ai_request(input: &str, context: &CommandContext) -> String {
    let mut sanitized = input.to_string();

    // 移除密码
    sanitized = regex::Regex::new(r"(?i)password[=:]\s*\S+")
        .unwrap()
        .replace_all(&sanitized, "password=***");

    // 移除 API 密钥
    sanitized = regex::Regex::new(r"(?i)(api[_-]?key|token|secret)[=:]\s*\S+")
        .unwrap()
        .replace_all(&sanitized, "$1=***");

    // 替换内部 IP 地址
    sanitized = regex::Regex::new(r"\b(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d+\.\d+\b")
        .unwrap()
        .replace_all(&sanitized, "192.168.x.x");

    sanitized
}
```

---

## 11. 前端设计系统

### 11.1 设计原则

| 原则 | 含义 |
|------|------|
| 静默 | 界面不争夺注意力，中性色调，无动画装饰 |
| 透气 | 信息密度高但不拥挤，充裕的留白 |
| 一致 | 跨平台视觉统一，不模拟特定 OS 外观 |
| 锐利 | 精确的视觉层级，间距差异传达层级 |
| 深邃 | 深色模式不是简单反转，每个灰色独立调试 |

### 11.2 色彩体系

```css
:root {
  /* 背景层级 - 四层深度 */
  --bg-0:  #0a0a0b;
  --bg-1:  #111113;
  --bg-2:  #18181b;
  --bg-3:  #1f1f23;

  /* 文字层级 - 三级对比 */
  --fg-0:  #fafafa;
  --fg-1:  #a1a1aa;
  --fg-2:  #52525b;

  /* 品牌色 */
  --accent:      #f59e0b;
  --accent-dim:  #92400e;
  --accent-bg:   rgba(245, 158, 11, 0.08);

  /* 语义色 */
  --success: #22c55e;
  --warning: #eab308;
  --error:   #ef4444;
  --info:    #3b82f6;

  /* 边框与分割线 */
  --border:    rgba(255, 255, 255, 0.06);
  --divider:   rgba(255, 255, 255, 0.04);

  /* 圆角 */
  --radius-sm:  4px;
  --radius-md:  6px;
  --radius-lg:  8px;
  --radius-xl:  12px;

  /* 间距基数: 4px */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}

:root[data-theme="light"] {
  --bg-0:  #ffffff;
  --bg-1:  #f9fafb;
  --bg-2:  #f3f4f6;
  --bg-3:  #e5e7eb;

  --fg-0:  #09090b;
  --fg-1:  #52525b;
  --fg-2:  #a1a1aa;

  --accent:      #d97706;
  --accent-dim:  #fef3c7;
  --accent-bg:   rgba(217, 119, 6, 0.06);

  --border:    rgba(0, 0, 0, 0.08);
  --divider:   rgba(0, 0, 0, 0.04);
}
```

### 11.3 字体系统

```
主字体:    system-ui, -apple-system, "Segoe UI", sans-serif
等宽字体:  "JetBrains Mono", "Fira Code", "SF Mono", ui-monospace, monospace
终端字体:  用户可配置，默认 "JetBrains Mono"
```

| 用途 | 字号 | 字重 | 行高 |
|------|------|------|------|
| 页面标题 | 20px | 600 | 28px |
| 面板标题 | 14px | 600 | 20px |
| 正文 | 13px | 400 | 20px |
| 辅助文字 | 12px | 400 | 16px |
| 代码/终端 | 14px | 400 | 1.5 |
| 标签 | 11px | 500 | 16px |

### 11.4 原生感 CSS 规范

不可违反的规则：

```css
/* 禁止 - 这是"感觉像网页"的头号标志 */
.hoverable-row { cursor: pointer; }

/* 正确 - 原生列表行不改变光标 */
.hoverable-row:hover { background: var(--bg-3); }

/* 禁止 - 浏览器默认行为 */
.chrome { user-select: text; }

/* 正确 - 只在可编辑内容上启用选择 */
.chrome { user-select: none; }
.editable-content { user-select: text; }

/* 禁止 - JS 平滑滚动有弹簧回弹 */
.scroll { scroll-behavior: smooth; }

/* 正确 - 原生惯性由 OS 控制 */
.scroll { scroll-behavior: auto; overscroll-behavior: contain; }

/* 禁止 - 页面切换应该是瞬时切替 */
.view-enter { animation: fadeIn 0.3s; }

/* 正确 - 原生应用不淡入淡出，直接切换 */
.view { display: none; }
.view.active { display: flex; }

/* 暗色模式跟随系统 */
@media (prefers-color-scheme: dark) {
  :root { color-scheme: dark; }
}
@media (prefers-color-scheme: light) {
  :root { color-scheme: light; }
}
```

### 11.5 Loading 状态规范

| 操作耗时 | 展示方式 |
|----------|----------|
| < 200ms | 无任何展示 |
| 200ms - 2s | 小型 spinner |
| > 2s | 进度条或文字提示 |

---

## 12. 页面布局设计

### 12.1 主窗口

```
+--------------------------------------------------------------+
| +--------+ +-----------------------------------------------+ |
| |        | |  [终端1] [终端2] [SFTP] [监控] [+]            | |
| |  搜索  | +-----------------------------------------------+ |
| |        | |                                               | |
| | -------| |                                               | |
| |        | |         终端 / SFTP / 监控 / AI 区域           | |
| | 分组1  | |                                               | |
| |  srv-1 | |                                               | |
| |  srv-2 | |                                               | |
| |        | |                                               | |
| | 分组2  | +-----------------------------------------------+ |
| |  srv-3 | |  连接状态 | 延迟 23ms | AI: GPT-4o    | 12:30 | |
| |  srv-4 | +-----------------------------------------------+ |
| +--------+ +-----------------------------------------------+ |
+--------------------------------------------------------------+
```

### 12.2 SFTP 双面板

```
+----------------------------------+----------------------------------+
|  本地                             |  远程                            |
|  /Users/xiaojia/                 |  /var/www/                       |
| --------------------------------| --------------------------------|
|  > project/                      |  > html/                         |
|  > documents/                    |  > logs/                         |
|    config.yaml                   |    nginx.conf                    |
|    readme.md                     |    app.js                        |
| --------------------------------| --------------------------------|
|  3 个项目 | 1.2 GB               |  5 个项目 | 340 MB               |
+----------------------------------+----------------------------------+
|  传输队列: nginx.conf [=========>       ] 67% | 2.3 MB/s  | [取消] |
+--------------------------------------------------------------+
```

### 12.3 AI 侧边栏

```
+----------------------------+
|  AI 助手                  [-]|
| --------------------------|
|                           |
|  AI: 你好，需要什么帮助？   |
|                           |
|  用户: 检查磁盘空间        |
|                           |
|  AI: 正在执行 df -h...     |
|                           |
|  +----------------------+|
|  | Filesystem  Size  Use ||
|  | /dev/sda1   45G   28% ||
|  +----------------------+|
|                           |
|  [分析] [继续] [复制命令]   |
|                           |
| --------------------------|
|  输入消息...           [发送] |
+----------------------------+
```

### 12.4 设置窗口

```
+----------------------------------------------------------+
|  设置                                                [X] |
+----------+-----------------------------------------------+
|          |                                               |
| > 通用   |  AI 服务配置                                   |
|          |                                               |
|   外观   |  服务类型  [OpenAI 兼容            v]         |
|          |                                               |
|   终端   |  Base URL  [https://api.openai.com/v1  ]     |
|          |                                               |
| > AI     |  API Key   [***************************] [显示]|
|          |                                               |
|   安全   |  模型      [gpt-4o                     ]     |
|          |                                               |
|   审计   |  温度  ----[====]---- 0.7                      |
|          |                                               |
|   快捷键 |  Max Tokens [4096                        ]   |
|          |                                               |
|   关于   |  [测试连接]                                    |
|          |                                               |
+----------+-----------------------------------------------+
```

---

## 13. 组件库设计

### 13.1 基础组件

| 组件 | 原生感规范 |
|------|----------|
| Button | 无 hover 动画（macOS），微弱背景变化（Windows） |
| Input | 1px 边框，聚焦时 accent 色边框，无 box-shadow |
| Select | 使用原生 `<select>` 样式覆盖 |
| Toggle | 跟随 OS 开关样式 |
| Slider | 简洁轨道 + 圆点，无气泡提示 |
| Badge | 11px 字号，圆角 4px，语义色 10% 透明度 |
| Tooltip | 300ms 延迟，使用 OS 原生 tooltip |
| ContextMenu | 使用 OS 原生右键菜单 |
| Dialog | 使用 Tauri 原生对话框，非 DOM 蒙层 |

### 13.2 业务组件

**连接卡片**：

```
+-----------------------------------+
|  [状态灯] prod-web-01             |
|  192.168.1.100:22                 |
|  root | 最后连接: 2小时前          |
|                  [连接] [编辑] [.] |
+-----------------------------------+
```

状态灯颜色：
- 绿色：在线，延迟正常
- 黄色：在线，延迟偏高
- 红色：连接失败
- 灰色：离线

**终端标签**：

```
+-----------------+
| [点] srv-01  [x]|  活跃标签，accent 色底部边线
+-----------------+
|   srv-02     [x]|  非活跃标签，灰色
+-----------------+
|       +         |  新建标签按钮
+-----------------+
```

关闭按钮仅在 hover 时显示（macOS）或始终显示（Windows）。

**监控图表**：

使用 SVG 绘制折线图，单色线条 + accent 色半透明填充，无动画，数据更新时直接重绘。

---

## 14. 性能优化设计

### 14.1 内存管理

| 优化项 | 目标 | 实现方式 |
|--------|------|----------|
| 终端输出节流 | 60fps cap | 高频输出合并渲染帧 |
| 文件列表懒加载 | 按需渲染 | 虚拟滚动，只渲染可见区域 |
| 连接池回收 | 空闲 5 分钟自动关闭 | 定时任务检查空闲连接 |
| 窗口销毁 | 关闭标签即销毁 | 标签页关闭时销毁 Xterm 实例 |
| AI 模型卸载 | 空闲释放 | 本地模型空闲 10 分钟后退出进程 |
| 后端空闲退出 | 空闲释放 | AI 服务空闲后退出，按需重建 |

### 14.2 启动优化

| 优化项 | 目标 | 实现方式 |
|--------|------|----------|
| 冷启动 | < 800ms | Tauri 预加载 + 按需加载功能模块 |
| 热启动 | < 100ms | 窗口隐藏而非关闭 |
| 首屏渲染 | < 300ms | 关键 CSS 内联，避免 FOUC |
| 预加载 | 常用连接 | 启动时预加载最近使用的连接配置 |

### 14.3 网络优化

- SSH 连接复用，减少 TCP 握手开销
- 大文件传输分片（64KB chunks），支持断点续传
- 压缩传输（`-C` 选项），减少网络流量
- 异步 IO，所有网络操作不阻塞 UI 线程
- 网络错误自动重试（指数退避）

### 14.4 UI 优化

- 虚拟列表渲染长列表（连接列表、文件列表、进程列表）
- 减少不必要的 UI 重绘
- 硬件加速渲染（WebGL 终端渲染）
- 响应式设计，适配不同分辨率屏幕
- 生产构建剥离 sourcemap

---

## 15. 部署与分发设计

### 15.1 打包配置

```toml
# src-tauri/tauri.conf.json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "identifier": "com.russh.app",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": { "installMode": "both" },
      "wix": null
    },
    "macOS": {
      "minimumSystemVersion": "11.0"
    },
    "linux": {
      "deb": { "depends": ["libgtk-3-0", "libwebkit2gtk-4.1-0"] },
      "rpm": { "depends": ["gtk3", "webkit2gtk4.1"] }
    }
  }
}
```

### 15.2 自动更新

```toml
# tauri.conf.json
{
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnRz...",
      "endpoints": [
        "https://releases.russh.app/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  }
}
```

### 15.3 发布渠道

| 渠道 | 平台 | 说明 |
|------|------|------|
| GitHub Releases | 全平台 | 主要分发渠道 |
| Homebrew | macOS | `brew install russh` |
| Chocolatey | Windows | `choco install russh` |
| AUR | Linux | `yay -S russh` |
| 官方网站 | 全平台 | 下载页面 |

### 15.4 代码签名

| 平台 | 工具 | 说明 |
|------|------|------|
| macOS | Apple Developer ID | 含公证（notarize） |
| Windows | Code Signing Certificate | EV 证书优先 |
| Linux | GPG 签名 | .sig 文件 |

---

## 16. 技术选型确认

| 模块 | 选型 | 版本 | 备注 |
|------|------|------|------|
| 桌面容器 | Tauri | v2.0 | Rust 壳 + 系统 WebView |
| 前端框架 | React | 18.x | TypeScript 严格模式 |
| UI 组件库 | shadcn/ui | latest | Tailwind CSS v3 |
| 终端模拟 | Xterm.js | 5.3+ | 含 fit/webgl/search addon |
| SSH 协议 | russh | 0.40 | 纯 Rust 实现 |
| AI 框架 | rig | 0.37 | Rust 原生 LLM 框架 |
| 本地模型 | llama-cpp-rs | 0.3 | GGUF 格式，可选 |
| 存储 | tauri-plugin-store | v2.0 | 安全持久化 |
| 密钥 | tauri-plugin-keyring | v2.0 | OS 密钥环集成 |
| 日志 | tracing | 0.1 | 结构化日志 |
| 数据库 | SQLite (sqlx) | - | 审计日志存储 |
| 正则 | regex | - | 危险命令匹配 |
| 测试 | Vitest + cargo-test | - | 前端 + 后端 |
| CI/CD | GitHub Actions | - | 三平台构建 |
