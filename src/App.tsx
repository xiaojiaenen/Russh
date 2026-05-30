import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/Sidebar";
import { Terminal } from "./components/Terminal";
import { SftpPanel } from "./components/SftpPanel";
import { MonitorPanel } from "./components/MonitorPanel";
import { TunnelPanel } from "./components/TunnelPanel";
import { AiPanel } from "./components/AiPanel";
import { BatchPanel } from "./components/BatchPanel";
import { ScriptPanel } from "./components/ScriptPanel";
import { useConnectionStore } from "./stores/connection-store";
import { ConnectionConfig } from "./types/connection";

interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

interface Tab {
  id: string;
  title: string;
  sessionId: string | null;
  type: "terminal" | "sftp" | "monitor" | "tunnel" | "batch" | "scripts";
  icon?: string;
}

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "welcome", title: "欢迎", sessionId: null, type: "terminal", icon: ">" },
  ]);
  const [activeTabId, setActiveTabId] = useState("welcome");
  const [showAi, setShowAi] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);

  const {
    connections,
    saveConnection,
    deleteConnection,
  } = useConnectionStore();

  useEffect(() => {
    invoke<AppInfo>("get_app_info").then(setAppInfo);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + N: New tab
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        handleNewTab();
      }
      // Cmd/Ctrl + W: Close tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (activeTabId !== "welcome") {
          handleCloseTab(activeTabId);
        }
      }
      // Cmd/Ctrl + Tab: Next tab
      if ((e.metaKey || e.ctrlKey) && e.key === "Tab") {
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        setActiveTabId(tabs[nextIndex].id);
      }
      // Cmd/Ctrl + 1-9: Switch to tab
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < tabs.length) {
          setActiveTabId(tabs[index].id);
        }
      }
      // Cmd/Ctrl + AI: Toggle AI panel
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        setShowAi((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId]);

  const handleConnect = useCallback(async (config: ConnectionConfig) => {
    try {
      const sessionId = await invoke<string>("connect", { config });
      const newTab: Tab = {
        id: crypto.randomUUID(),
        title: config.name || config.host,
        sessionId,
        type: "terminal",
        icon: ">",
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (e) {
      console.error("Connection failed:", e);
    }
  }, []);

  const handleOpenSftp = useCallback(async (config: ConnectionConfig) => {
    try {
      const sessionId = await invoke<string>("connect", { config });
      const newTab: Tab = {
        id: crypto.randomUUID(),
        title: config.name || config.host,
        sessionId,
        type: "sftp",
        icon: "/",
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (e) {
      console.error("Connection failed:", e);
    }
  }, []);

  const handleOpenMonitor = useCallback(async (config: ConnectionConfig) => {
    try {
      const sessionId = await invoke<string>("connect", { config });
      const newTab: Tab = {
        id: crypto.randomUUID(),
        title: config.name || config.host,
        sessionId,
        type: "monitor",
        icon: "#",
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (e) {
      console.error("Connection failed:", e);
    }
  }, []);

  const handleOpenTunnel = useCallback(async (config: ConnectionConfig) => {
    try {
      const sessionId = await invoke<string>("connect", { config });
      const newTab: Tab = {
        id: crypto.randomUUID(),
        title: config.name || config.host,
        sessionId,
        type: "tunnel",
        icon: "~",
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (e) {
      console.error("Connection failed:", e);
    }
  }, []);

  const handleOpenBatch = useCallback(() => {
    const newTab: Tab = {
      id: crypto.randomUUID(),
      title: "批量执行",
      sessionId: null,
      type: "batch",
      icon: "*",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const handleOpenScripts = useCallback(() => {
    const newTab: Tab = {
      id: crypto.randomUUID(),
      title: "脚本库",
      sessionId: null,
      type: "scripts",
      icon: "$",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (filtered.length === 0) {
          return [{ id: "welcome", title: "欢迎", sessionId: null, type: "terminal" as const, icon: ">" }];
        }
        return filtered;
      });
      setActiveTabId((prev) => {
        if (prev === tabId) {
          const remaining = tabs.filter((t) => t.id !== tabId);
          return remaining.length > 0 ? remaining[0].id : "welcome";
        }
        return prev;
      });
    },
    [tabs]
  );

  const handleNewTab = useCallback(() => {
    const newTab: Tab = {
      id: crypto.randomUUID(),
      title: "新终端",
      sessionId: null,
      type: "terminal",
      icon: ">",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  function getTabIcon(type: Tab["type"]) {
    switch (type) {
      case "terminal": return ">";
      case "sftp": return "/";
      case "monitor": return "#";
      case "tunnel": return "~";
      case "batch": return "*";
      case "scripts": return "$";
      default: return ">";
    }
  }

  return (
    <div className="flex h-screen w-screen bg-bg-1 text-fg-0 font-sans">
      {/* Sidebar */}
      <div style={{ width: sidebarWidth }} className="flex-shrink-0">
        <Sidebar
          connections={connections}
          onConnect={handleConnect}
          onOpenSftp={handleOpenSftp}
          onOpenMonitor={handleOpenMonitor}
          onOpenTunnel={handleOpenTunnel}
          onSave={saveConnection}
          onDelete={deleteConnection}
        />
      </div>

      {/* Sidebar resize handle */}
      <div
        className="w-1 hover:bg-accent/30 cursor-col-resize flex-shrink-0 transition-colors"
        onMouseDown={(e) => {
          const startX = e.clientX;
          const startWidth = sidebarWidth;
          const onMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(400, startWidth + delta));
            setSidebarWidth(newWidth);
          };
          const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
          };
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        }}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="h-10 bg-bg-0 border-b border-border flex items-center px-1 gap-px overflow-x-auto">
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className={`group h-8 px-3 flex items-center gap-2 text-sm rounded-t-md cursor-pointer flex-shrink-0 ${
                tab.id === activeTabId
                  ? "text-fg-0 bg-bg-2"
                  : "text-fg-2 hover:text-fg-1 hover:bg-bg-3"
              }`}
              onClick={() => setActiveTabId(tab.id)}
              title={`${tab.title} (Cmd+${index + 1})`}
            >
              <span className="text-accent font-mono">{tab.icon || getTabIcon(tab.type)}</span>
              <span className="truncate max-w-[140px]">{tab.title}</span>
              {tab.id !== "welcome" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  className="hidden group-hover:flex w-4 h-4 items-center justify-center text-fg-2 hover:text-error rounded text-xs"
                >
                  x
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleNewTab}
            className="h-8 w-8 flex items-center justify-center text-fg-2 hover:text-fg-0 hover:bg-bg-3 rounded-md text-lg flex-shrink-0"
            title="新终端 (Cmd+N)"
          >
            +
          </button>
          <div className="flex-1" />
          <button
            onClick={handleOpenBatch}
            className="h-8 px-2 text-sm text-fg-2 hover:text-fg-0 hover:bg-bg-3 rounded flex-shrink-0"
            title="批量执行"
          >
            批量
          </button>
          <button
            onClick={handleOpenScripts}
            className="h-8 px-2 text-sm text-fg-2 hover:text-fg-0 hover:bg-bg-3 rounded flex-shrink-0"
            title="脚本库"
          >
            脚本
          </button>
          <button
            onClick={() => setShowAi(!showAi)}
            className={`h-8 px-3 text-sm rounded flex-shrink-0 font-medium ${
              showAi
                ? "bg-accent text-bg-0"
                : "text-fg-2 hover:text-fg-0 hover:bg-bg-3"
            }`}
            title="AI 助手 (Cmd+I)"
          >
            AI
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-hidden">
            {activeTab?.sessionId ? (
              activeTab.type === "sftp" ? (
                <SftpPanel sessionId={activeTab.sessionId} />
              ) : activeTab.type === "monitor" ? (
                <MonitorPanel sessionId={activeTab.sessionId} />
              ) : activeTab.type === "tunnel" ? (
                <TunnelPanel sessionId={activeTab.sessionId} />
              ) : (
                <Terminal sessionId={activeTab.sessionId} />
              )
            ) : activeTab?.type === "batch" ? (
              <BatchPanel connections={connections.map((c) => ({ id: c.id, name: c.name, host: c.host }))} />
            ) : activeTab?.type === "scripts" ? (
              <ScriptPanel onExecute={(cmd) => console.log("Execute:", cmd)} />
            ) : (
              <WelcomeScreen appInfo={appInfo} connections={connections} onConnect={handleConnect} />
            )}
          </div>
          {showAi && (
            <div className="w-80 border-l border-border flex-shrink-0">
              <AiPanel sessionId={activeTab?.sessionId ?? null} />
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="h-7 bg-bg-0 border-t border-border flex items-center px-3 text-sm text-fg-2 gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${activeTab?.sessionId ? "bg-success" : "bg-fg-2"}`} />
            <span>{activeTab?.sessionId ? "已连接" : "未连接"}</span>
          </div>
          {activeTab?.sessionId && (
            <span className="text-fg-2">{activeTab.title}</span>
          )}
          <div className="flex-1" />
          <span className="text-fg-2">{tabs.length} 个标签</span>
          <span className="text-fg-2">{appInfo?.platform || "unknown"}</span>
          <span className="text-fg-2">v{appInfo?.version || "0.1.0"}</span>
        </div>
      </main>
    </div>
  );
}

function WelcomeScreen({ appInfo, connections, onConnect }: { appInfo: AppInfo | null; connections: ConnectionConfig[]; onConnect: (config: ConnectionConfig) => void }) {
  return (
    <div className="h-full flex items-center justify-center bg-bg-1">
      <div className="text-center max-w-md">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-fg-0 mb-2">
            {appInfo?.name || "Russh"}
          </h1>
          <p className="text-lg text-fg-1">AI 原生 SSH 客户端</p>
          <p className="text-sm text-fg-2 mt-2">
            v{appInfo?.version || "0.1.0"}
          </p>
        </div>

        {/* Quick actions */}
        <div className="space-y-4 mb-8">
          <div className="text-sm text-fg-2 mb-4">快捷操作</div>

          {connections.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-fg-2 mb-2">最近连接</div>
              {connections.slice(0, 3).map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => onConnect(conn)}
                  className="w-full flex items-center gap-3 p-3 bg-bg-2 hover:bg-bg-3 rounded-lg border border-border transition-colors"
                >
                  <span className="text-accent font-mono">&gt;</span>
                  <div className="text-left flex-1">
                    <div className="text-sm text-fg-0">{conn.name || conn.host}</div>
                    <div className="text-xs text-fg-2">{conn.username}@{conn.host}:{conn.port}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="text-xs text-fg-2 mt-4">快捷键</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between p-2 bg-bg-2 rounded">
              <span className="text-fg-1">新终端</span>
              <kbd className="px-1.5 py-0.5 bg-bg-3 rounded text-fg-2">Cmd+N</kbd>
            </div>
            <div className="flex items-center justify-between p-2 bg-bg-2 rounded">
              <span className="text-fg-1">关闭标签</span>
              <kbd className="px-1.5 py-0.5 bg-bg-3 rounded text-fg-2">Cmd+W</kbd>
            </div>
            <div className="flex items-center justify-between p-2 bg-bg-2 rounded">
              <span className="text-fg-1">切换标签</span>
              <kbd className="px-1.5 py-0.5 bg-bg-3 rounded text-fg-2">Cmd+Tab</kbd>
            </div>
            <div className="flex items-center justify-between p-2 bg-bg-2 rounded">
              <span className="text-fg-1">AI 助手</span>
              <kbd className="px-1.5 py-0.5 bg-bg-3 rounded text-fg-2">Cmd+I</kbd>
            </div>
          </div>
        </div>

        {/* Get started */}
        <div className="text-sm text-fg-2">
          在左侧栏点击 <kbd className="px-1.5 py-0.5 bg-bg-3 rounded text-fg-1">+</kbd> 添加第一个连接
        </div>
      </div>
    </div>
  );
}

export default App;
