import { useState, useRef, useEffect, useCallback } from "react";
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

export function AiPanel({ sessionId }: AiPanelProps) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  // Listen for streaming chunks
  useEffect(() => {
    const unlisten = listen<AiStreamChunk>("ai_stream", (event) => {
      const { content, done } = event.payload;

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.streaming) {
          // Append to existing streaming message
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

  const handleSendStream = useCallback(async (message: string) => {
    if (!message.trim() || loading) return;

    const userMessage: AiMessage = { role: "user", content: message };
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
          { role: "assistant", content: `Error: ${e}` },
        ];
      });
    } finally {
      setLoading(false);
      streamingRef.current = false;
    }
  }, [messages, loading]);

  async function handleSend() {
    await handleSendStream(input);
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
        { role: "assistant", content: `Error: ${e}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg-0 border-l border-border w-80">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center px-3">
        <span className="text-xs font-semibold text-fg-0">AI Assistant</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-fg-2">Ask anything about your server</p>
            <p className="text-[10px] text-fg-2 mt-1">
              Use /ai to convert natural language to commands
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="text-xs">
            <div className="text-[10px] text-fg-2 mb-1">
              {msg.role === "user" ? "You" : "AI"}
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
            placeholder="Ask a question..."
            className="flex-1 h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleNlToCommand}
            disabled={!input.trim() || loading}
            className="h-8 px-2 text-[10px] text-fg-2 border border-border rounded hover:bg-bg-3 disabled:opacity-50"
            title="Convert to command"
          >
            /ai
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="h-8 px-2 text-[10px] text-bg-0 bg-accent rounded hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
