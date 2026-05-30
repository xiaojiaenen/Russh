import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string | null;
}

interface TerminalData {
  session_id: string;
  data: string;
}

interface ConnectionStatus {
  session_id: string;
  status: string;
  message: string | null;
}

const THEME = {
  background: "#111113",
  foreground: "#fafafa",
  cursor: "#f59e0b",
  cursorAccent: "#111113",
  selectionBackground: "rgba(245, 158, 11, 0.2)",
  black: "#18181b",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#fafafa",
  brightBlack: "#52525b",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#ffffff",
};

export function Terminal({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);

  // Keep ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const handleTerminalData = useCallback(async (event: { payload: TerminalData }) => {
    const { session_id, data } = event.payload;
    if (session_id === sessionIdRef.current && termRef.current) {
      termRef.current.write(data);
    }
  }, []);

  const handleConnectionStatus = useCallback(async (event: { payload: ConnectionStatus }) => {
    const { session_id, status, message } = event.payload;
    if (session_id === sessionIdRef.current && termRef.current) {
      const term = termRef.current;
      if (status === "disconnected") {
        term.writeln("\r\n\x1b[38;2;239;68;68mConnection closed\x1b[0m");
        term.write("\x1b[38;2;161;161;170m>\x1b[0m ");
      } else if (status === "error") {
        term.writeln(`\r\n\x1b[38;2;239;68;68mError: ${message || "Unknown error"}\x1b[0m`);
      }
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerminal({
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", ui-monospace, monospace',
      fontSize: 14,
      lineHeight: 1.5,
      theme: THEME,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new SearchAddon());
    term.loadAddon(new WebLinksAddon());

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available
    }

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome message
    term.writeln("\x1b[38;2;245;158;11mRussh\x1b[0m - AI-native SSH client");
    term.writeln("");
    term.write("\x1b[38;2;161;161;170m>\x1b[0m ");

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    // Listen for terminal output from backend
    const unlistenData = listen<TerminalData>("terminal_data", handleTerminalData);
    const unlistenStatus = listen<ConnectionStatus>("connection_status", handleConnectionStatus);

    return () => {
      resizeObserver.disconnect();
      unlistenData.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [handleTerminalData, handleConnectionStatus]);

  // Handle keyboard input - send to backend
  useEffect(() => {
    const term = termRef.current;
    if (!term || !sessionId) return;

    const disposable = term.onData(async (data) => {
      try {
        await invoke("ssh_write", { sessionId, data });
      } catch (e) {
        console.error("Failed to write to SSH:", e);
      }
    });

    return () => disposable.dispose();
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-bg-1"
    />
  );
}
