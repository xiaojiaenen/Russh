import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Keyboard shortcuts:
// Ctrl+A: Select all servers
// Enter: Execute command (when command input is focused)

interface BatchPanelProps {
  connections: Array<{ id: string; name: string; host: string }>;
}

interface BatchResult {
  session_id: string;
  server_name: string;
  output: string;
  success: boolean;
}

interface BatchProgress {
  task_id: string;
  completed: number;
  total: number;
  result: BatchResult | null;
}

export function BatchPanel({ connections }: BatchPanelProps) {
  const [command, setCommand] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<BatchResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    const unlisten = listen<BatchProgress>("batch_progress", (event) => {
      const { completed, total, result } = event.payload;
      setProgress({ completed, total });
      if (result) {
        setResults((prev) => [...prev, result]);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(connections.map((c) => c.id)));
  }

  async function handleExecute() {
    if (!command.trim() || selectedIds.size === 0 || running) return;

    setRunning(true);
    setResults([]);
    setProgress({ completed: 0, total: selectedIds.size });

    try {
      await invoke("batch_execute", {
        command,
        sessionIds: Array.from(selectedIds),
      });
    } catch (e) {
      console.error("Batch execution failed:", e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg-1 p-4">
      <h2 className="text-sm font-semibold text-fg-0 mb-4">Batch Command Execution</h2>

      {/* Server selection */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-fg-1">Target Servers</span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-2xs text-fg-2 hover:text-fg-0"
            >
              Select All
            </button>
            <span className="text-2xs text-fg-2">
              {selectedIds.size} selected
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {connections.map((conn) => (
            <button
              key={conn.id}
              onClick={() => toggleSelect(conn.id)}
              className={`px-2 py-1 text-2xs rounded border ${
                selectedIds.has(conn.id)
                  ? "border-accent text-accent bg-accent/10"
                  : "border-border text-fg-2 hover:text-fg-0"
              }`}
            >
              {conn.name || conn.host}
            </button>
          ))}
        </div>
      </div>

      {/* Command input */}
      <div className="mb-4">
        <label className="block text-xs text-fg-1 mb-1">Command</label>
        <div className="flex gap-2">
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter command to execute..."
            rows={3}
            className="flex-1 px-2 py-1.5 bg-bg-0 border border-border rounded text-xs text-fg-0 font-mono placeholder:text-fg-2 focus:outline-none focus:border-accent resize-none"
          />
          <button
            onClick={handleExecute}
            disabled={!command.trim() || selectedIds.size === 0 || running}
            className="h-8 px-3 text-xs text-bg-0 bg-accent rounded hover:opacity-90 disabled:opacity-50 self-end"
          >
            {running ? `Running (${progress.completed}/${progress.total})` : "Execute"}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="flex-1 overflow-y-auto scroll">
          <div className="text-xs text-fg-1 mb-2">Results</div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`p-2 rounded border ${
                  r.success
                    ? "border-success/30 bg-success/5"
                    : "border-error/30 bg-error/5"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-2xs text-fg-0 font-mono">
                    {r.server_name}
                  </span>
                  <span
                    className={`text-2xs ${
                      r.success ? "text-success" : "text-error"
                    }`}
                  >
                    {r.success ? "OK" : "FAILED"}
                  </span>
                </div>
                <pre className="text-2xs text-fg-2 font-mono whitespace-pre-wrap">
                  {r.output}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
