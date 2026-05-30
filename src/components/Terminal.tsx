import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { getTheme, themes } from "../themes/terminal-themes";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string | null;
}

export function Terminal({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [themeName, setThemeName] = useState("ink");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Create terminal once
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerminal({
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", ui-monospace, monospace',
      fontSize: 16,
      lineHeight: 1.4,
      theme: getTheme(themeName).colors,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new SearchAddon());
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome
    term.writeln("\x1b[38;2;245;158;11mRussh\x1b[0m - AI 原生 SSH 客户端");
    term.writeln("");
    term.write("\x1b[38;2;161;161;170m>\x1b[0m ");

    // Resize
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Update theme
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTheme(themeName).colors;
    }
  }, [themeName]);

  // Listen for SSH output
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const unlisten = listen<{ session_id: string; data: string }>("terminal_data", (event) => {
      if (event.payload.session_id === sessionId) {
        term.write(event.payload.data);
      }
    });

    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  // Listen for connection status
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const unlisten = listen<{ session_id: string; status: string; message: string | null }>("connection_status", (event) => {
      if (event.payload.session_id === sessionId) {
        if (event.payload.status === "disconnected") {
          term.writeln("\r\n\x1b[38;2;239;68;68m连接已断开\x1b[0m");
          term.write("\x1b[38;2;161;161;170m>\x1b[0m ");
        }
      }
    });

    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  // Handle keyboard input - send to SSH
  useEffect(() => {
    const term = termRef.current;
    if (!term || !sessionId) return;

    const disposable = term.onData(async (data) => {
      try {
        await invoke("ssh_write", { sessionId, data });
      } catch (e) {
        console.error("SSH write failed:", e);
      }
    });

    return () => { disposable.dispose(); };
  }, [sessionId]);

  // Search
  function doSearch(prev = false) {
    // Search addon is created inside terminal, need to access it
    // For now just log
    console.log("Search:", searchQuery, prev ? "prev" : "next");
  }

  return (
    <div className="relative w-full h-full">
      {showSearch && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1 p-1 bg-bg-2 border border-border rounded-bl">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(e.shiftKey); }}
            placeholder="搜索..."
            className="w-48 h-6 px-2 bg-bg-1 border border-border rounded text-sm text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            autoFocus
          />
          <button onClick={() => doSearch(true)} className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-xs">^</button>
          <button onClick={() => doSearch(false)} className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-xs">v</button>
          <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-xs">X</button>
        </div>
      )}

      <div className="absolute bottom-2 right-2 z-10">
        <select
          value={themeName}
          onChange={(e) => setThemeName(e.target.value)}
          className="h-6 px-1 bg-bg-2 border border-border rounded text-xs text-fg-2 focus:outline-none focus:border-accent"
        >
          {Object.entries(themes).map(([key, theme]) => (
            <option key={key} value={key}>{theme.name}</option>
          ))}
        </select>
      </div>

      <div ref={containerRef} className="w-full h-full bg-bg-1" />
    </div>
  );
}
