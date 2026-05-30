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
  const [themeName, setThemeName] = useState("ink");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available
    }

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Welcome message
    term.writeln("\x1b[38;2;245;158;11mRussh\x1b[0m - AI-native SSH client");
    term.writeln("");
    term.write("\x1b[38;2;161;161;170m>\x1b[0m ");

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    // Listen for terminal output
    const unlistenData = listen<TerminalData>("terminal_data", handleTerminalData);
    const unlistenStatus = listen<ConnectionStatus>("connection_status", handleConnectionStatus);

    return () => {
      resizeObserver.disconnect();
      unlistenData.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [handleTerminalData, handleConnectionStatus, themeName]);

  // Handle keyboard input
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

  // Handle theme change
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTheme(themeName).colors;
    }
  }, [themeName]);

  // Search handlers
  function handleSearch() {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery);
    }
  }

  function handleSearchPrev() {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findPrevious(searchQuery);
    }
  }

  function handleSearchClose() {
    setShowSearch(false);
    setSearchQuery("");
    if (searchAddonRef.current) {
      searchAddonRef.current.clearDecorations();
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
            placeholder="Search..."
            className="w-48 h-6 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            autoFocus
          />
          <button
            onClick={handleSearchPrev}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-[10px]"
          >
            ^
          </button>
          <button
            onClick={handleSearch}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-[10px]"
          >
            v
          </button>
          <button
            onClick={handleSearchClose}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-[10px]"
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
          className="h-6 px-1 bg-bg-2 border border-border rounded text-[10px] text-fg-2 focus:outline-none focus:border-accent"
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
