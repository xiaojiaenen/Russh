import { useEffect, useRef } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string | null;
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

    // Try WebGL for better performance
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available, fallback to canvas
    }

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome message
    term.writeln("\x1b[38;2;245;158;11mRussh\x1b[0m - AI-native SSH client");
    term.writeln("");
    term.write("\x1b[38;2;161;161;170m>\x1b[0m ");

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const disposable = term.onData((data) => {
      // In a real implementation, this would send data to the SSH session
      // via invoke("ssh_write", { sessionId, data })
      console.log("Terminal input:", data);
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
