import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { getTheme, themes } from "../themes/terminal-themes";
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

export function Terminal({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);
  const disposedRef = useRef(false);
  const [themeName, setThemeName] = useState("ink");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const handleTerminalData = useCallback(async (event: { payload: TerminalData }) => {
    const { session_id, data } = event.payload;
    if (session_id === sessionIdRef.current && termRef.current && !disposedRef.current) {
      try {
        termRef.current.write(data);
      } catch {
        // Terminal may have been disposed
      }
    }
  }, []);

  const handleConnectionStatus = useCallback(async (event: { payload: ConnectionStatus }) => {
    const { session_id, status, message } = event.payload;
    if (session_id === sessionIdRef.current && termRef.current && !disposedRef.current) {
      try {
        const term = termRef.current;
        if (status === "disconnected") {
          term.writeln("\r\n\x1b[38;2;239;68;68m连接已断开\x1b[0m");
          term.write("\x1b[38;2;161;161;170m>\x1b[0m ");
        } else if (status === "error") {
          term.writeln(`\r\n\x1b[38;2;239;68;68m错误: ${message || "未知错误"}\x1b[0m`);
        }
      } catch {
        // Terminal may have been disposed
      }
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    disposedRef.current = false;

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
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    term.loadAddon(new WebLinksAddon());

    // Open first (creates canvas in DOM)
    term.open(containerRef.current);

    // Then load WebGL (needs canvas to exist)
    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available, fallback to canvas renderer
    }

    // Finally fit (needs renderer to be ready)
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Welcome message
    term.writeln("\x1b[38;2;245;158;11mRussh\x1b[0m - AI 原生 SSH 客户端");
    term.writeln("");
    term.write("\x1b[38;2;161;161;170m>\x1b[0m ");

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!disposedRef.current) {
        try {
          fitAddon.fit();
        } catch {
          // Ignore resize errors
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    // Listen for terminal output
    const unlistenData = listen<TerminalData>("terminal_data", handleTerminalData);
    const unlistenStatus = listen<ConnectionStatus>("connection_status", handleConnectionStatus);

    return () => {
      disposedRef.current = true;
      resizeObserver.disconnect();
      unlistenData.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      try {
        term.dispose();
      } catch {
        // Ignore dispose errors
      }
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [handleTerminalData, handleConnectionStatus, themeName]);

  // Handle keyboard input
  useEffect(() => {
    const term = termRef.current;
    if (!term || !sessionId || disposedRef.current) return;

    const disposable = term.onData(async (data) => {
      if (disposedRef.current) return;
      try {
        await invoke("ssh_write", { sessionId, data });
      } catch (e) {
        console.error("Failed to write to SSH:", e);
      }
    });

    return () => {
      try {
        disposable.dispose();
      } catch {
        // Ignore
      }
    };
  }, [sessionId]);

  // Handle theme change
  useEffect(() => {
    if (termRef.current && !disposedRef.current) {
      try {
        termRef.current.options.theme = getTheme(themeName).colors;
      } catch {
        // Ignore
      }
    }
  }, [themeName]);

  // Search handlers
  function handleSearch() {
    if (searchAddonRef.current && searchQuery && !disposedRef.current) {
      searchAddonRef.current.findNext(searchQuery);
    }
  }

  function handleSearchPrev() {
    if (searchAddonRef.current && searchQuery && !disposedRef.current) {
      searchAddonRef.current.findPrevious(searchQuery);
    }
  }

  function handleSearchClose() {
    setShowSearch(false);
    setSearchQuery("");
    if (searchAddonRef.current && !disposedRef.current) {
      try {
        searchAddonRef.current.clearDecorations();
      } catch {
        // Ignore
      }
    }
  }

  // Keyboard shortcut for search (Cmd+F)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
      if (e.key === "Escape" && showSearch) {
        handleSearchClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch, searchQuery]);

  return (
    <div className="relative w-full h-full">
      {/* Search bar */}
      {showSearch && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1 p-1 bg-bg-2 border border-border rounded-bl">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.shiftKey ? handleSearchPrev() : handleSearch();
              }
            }}
            placeholder="搜索..."
            className="w-48 h-6 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            autoFocus
          />
          <button
            onClick={handleSearchPrev}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-2xs"
          >
            ^
          </button>
          <button
            onClick={handleSearch}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-2xs"
          >
            v
          </button>
          <button
            onClick={handleSearchClose}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-2xs"
          >
            X
          </button>
        </div>
      )}

      {/* Theme selector */}
      <div className="absolute bottom-2 right-2 z-10">
        <select
          value={themeName}
          onChange={(e) => setThemeName(e.target.value)}
          className="h-6 px-1 bg-bg-2 border border-border rounded text-2xs text-fg-2 focus:outline-none focus:border-accent"
        >
          {Object.entries(themes).map(([key, theme]) => (
            <option key={key} value={key}>
              {theme.name}
            </option>
          ))}
        </select>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="w-full h-full bg-bg-1" />
    </div>
  );
}
