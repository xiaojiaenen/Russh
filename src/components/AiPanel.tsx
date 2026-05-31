import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface AiPanelProps {
  sessionId: string | null;
}

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  command?: string;
  streaming?: boolean;
}

interface AiStreamChunk {
  content: string;
  done: boolean;
}

interface AiConfig {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_secs: number;
}

const defaultConfig: AiConfig = {
  id: "",
  name: "OpenAI",
  provider: "openai_compatible",
  base_url: "https://api.openai.com/v1",
  api_key: "",
  model: "gpt-4o",
  temperature: 0.7,
  max_tokens: 4096,
  timeout_secs: 30,
};

export function AiPanel({ sessionId }: AiPanelProps) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<AiConfig>(defaultConfig);
  const [testResult, setTestResult] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  // Load config on mount
  useEffect(() => {
    invoke<AiConfig[]>("ai_list_configs").then((configs) => {
      if (configs.length > 0) {
        setConfig(configs[0]);
      }
    }).catch(() => {});
  }, []);

  // Listen for streaming chunks
  useEffect(() => {
    const unlisten = listen<AiStreamChunk>("ai_stream", (event) => {
      const { content, done } = event.payload;

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.streaming) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + content,
          };
          if (done) {
            updated[updated.length - 1].streaming = false;
            streamingRef.current = false;
          }
          return updated;
        }
        return prev;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage: AiMessage = { role: "user", content: input };
    setMessages((prev) => [
      ...prev,
      userMessage,
      { role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setLoading(true);
    streamingRef.current = true;

    try {
      await invoke("ai_chat_stream", {
        messages: [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
    } catch (e) {
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.streaming);
        return [
          ...filtered,
          { role: "assistant", content: `错误: ${e}` },
        ];
      });
    } finally {
      setLoading(false);
      streamingRef.current = false;
    }
  }

  async function handleNlToCommand() {
    if (!input.trim() || loading) return;

    const userMessage: AiMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await invoke<{
        content: string;
        command: string | null;
        risk_level: string | null;
      }>("ai_nl_to_command", {
        request: {
          messages: [{ role: "user", content: input }],
          session_id: sessionId,
        },
      });

      const assistantMessage: AiMessage = {
        role: "assistant",
        content: response.content,
        command: response.command ?? undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `错误: ${e}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig() {
    try {
      const configToSave = config.id ? config : { ...config, id: crypto.randomUUID() };
      await invoke("ai_save_config", { config: configToSave });
      setConfig(configToSave);
      setShowSettings(false);
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  }

  async function handleTestConnection() {
    setTestResult(null);
    try {
      const result = await invoke<string>("ai_test_connection", { config });
      setTestResult(result);
    } catch (e) {
      setTestResult(`错误: ${e}`);
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg-0">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center px-3 gap-2">
        <span className="text-sm font-semibold text-fg-0 flex-1">AI 助手</span>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-sm"
          title="AI 设置"
        >
          *
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b border-border p-3 space-y-3 bg-bg-1">
          <div className="text-xs text-fg-1 font-medium">AI 配置</div>

          <div>
            <label className="block text-xs text-fg-2 mb-1">服务地址</label>
            <input
              type="text"
              value={config.base_url}
              onChange={(e) => setConfig((p) => ({ ...p, base_url: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              className="w-full h-7 px-2 bg-bg-2 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-fg-2 mb-1">API Key</label>
            <input
              type="password"
              value={config.api_key}
              onChange={(e) => setConfig((p) => ({ ...p, api_key: e.target.value }))}
              placeholder="sk-..."
              className="w-full h-7 px-2 bg-bg-2 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-fg-2 mb-1">模型</label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig((p) => ({ ...p, model: e.target.value }))}
              placeholder="gpt-4o"
              className="w-full h-7 px-2 bg-bg-2 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-fg-2 mb-1">Temperature</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature}
                onChange={(e) => setConfig((p) => ({ ...p, temperature: parseFloat(e.target.value) || 0.7 }))}
                className="w-full h-7 px-2 bg-bg-2 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-fg-2 mb-1">Max Tokens</label>
              <input
                type="number"
                value={config.max_tokens}
                onChange={(e) => setConfig((p) => ({ ...p, max_tokens: parseInt(e.target.value) || 4096 }))}
                className="w-full h-7 px-2 bg-bg-2 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {testResult && (
            <div className={`text-xs px-2 py-1.5 rounded ${testResult.includes("错误") ? "bg-error/10 text-error" : "bg-success/10 text-success"}`}>
              {testResult}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleTestConnection}
              className="flex-1 h-7 text-xs text-fg-2 border border-border rounded hover:bg-bg-3"
            >
              测试连接
            </button>
            <button
              onClick={handleSaveConfig}
              className="flex-1 h-7 text-xs text-bg-0 bg-accent rounded hover:opacity-90"
            >
              保存配置
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-fg-2">询问任何关于服务器的问题</p>
            <p className="text-xs text-fg-2 mt-1">
              使用 /ai 将自然语言转换为命令
            </p>
            {!config.api_key && (
              <button
                onClick={() => setShowSettings(true)}
                className="mt-4 px-3 py-1.5 text-xs text-accent border border-accent/30 rounded hover:bg-accent/10"
              >
                配置 AI 服务
              </button>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="text-sm">
            <div className="text-xs text-fg-2 mb-1">
              {msg.role === "user" ? "用户" : "AI"}
            </div>
            <div className="text-fg-0 whitespace-pre-wrap">
              {msg.content}
              {msg.streaming && <span className="inline-block w-1.5 h-3 bg-accent ml-0.5 animate-pulse" />}
            </div>
            {msg.command && (
              <div className="mt-2 p-2 bg-bg-2 border border-border rounded font-mono text-fg-1">
                {msg.command}
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={config.api_key ? "输入问题..." : "请先配置 AI 服务"}
            disabled={!config.api_key}
            className="flex-1 h-8 px-2 bg-bg-1 border border-border rounded text-sm text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={handleNlToCommand}
            disabled={!input.trim() || loading || !config.api_key}
            className="h-8 px-2 text-sm text-fg-2 border border-border rounded hover:bg-bg-3 disabled:opacity-50"
            title="转换为命令"
          >
            /ai
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || !config.api_key}
            className="h-8 px-3 text-sm text-bg-0 bg-accent rounded hover:opacity-90 disabled:opacity-50"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
