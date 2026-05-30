import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/Sidebar";
import { Terminal } from "./components/Terminal";
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
  type: "terminal" | "sftp" | "monitor";
}

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "welcome", title: "Welcome", sessionId: null, type: "terminal" },
  ]);
  const [activeTabId, setActiveTabId] = useState("welcome");

  const {
    connections,
    saveConnection,
    deleteConnection,
  } = useConnectionStore();

  useEffect(() => {
    invoke<AppInfo>("get_app_info").then(setAppInfo);
  }, []);

  const handleConnect = useCallback(async (config: ConnectionConfig) => {
    try {
      const sessionId = await invoke<string>("connect", { config });
      const newTab: Tab = {
        id: crypto.randomUUID(),
        title: config.name || config.host,
        sessionId,
        type: "terminal",
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (e) {
      console.error("Connection failed:", e);
    }
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (filtered.length === 0) {
          return [{ id: "welcome", title: "Welcome", sessionId: null, type: "terminal" as const }];
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
      title: "New Tab",
      sessionId: null,
      type: "terminal",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div className="flex h-screen w-screen bg-bg-1 text-fg-0 font-sans">
      {/* Sidebar */}
      <Sidebar
        connections={connections}
        onConnect={handleConnect}
        onSave={saveConnection}
        onDelete={deleteConnection}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Tab bar */}
        <div className="h-10 bg-bg-0 border-b border-border flex items-center px-2 gap-px">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group h-8 px-3 flex items-center gap-2 text-xs rounded-t-md cursor-pointer ${
                tab.id === activeTabId
                  ? "text-fg-0 bg-bg-2"
                  : "text-fg-2 hover:text-fg-1 hover:bg-bg-3"
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="truncate max-w-[120px]">{tab.title}</span>
              {tab.id !== "welcome" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  className="hidden group-hover:block w-4 h-4 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-[10px]"
                >
                  X
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleNewTab}
            className="h-8 w-8 flex items-center justify-center text-fg-2 hover:text-fg-0 hover:bg-bg-3 rounded-md text-sm"
          >
            +
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {activeTab?.sessionId ? (
            <Terminal sessionId={activeTab.sessionId} />
          ) : (
            <WelcomeScreen appInfo={appInfo} />
          )}
        </div>

        {/* Status bar */}
        <div className="h-7 bg-bg-0 border-t border-border flex items-center px-3 text-xs text-fg-2">
          <span>{activeTab?.sessionId ? "Connected" : "Not connected"}</span>
          <span className="ml-auto">{appInfo?.platform || "unknown"}</span>
        </div>
      </main>
    </div>
  );
}

function WelcomeScreen({ appInfo }: { appInfo: AppInfo | null }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-fg-0 mb-2">
          {appInfo?.name || "Russh"}
        </h1>
        <p className="text-sm text-fg-1 mb-1">AI-native SSH client</p>
        <p className="text-xs text-fg-2 mb-6">
          v{appInfo?.version || "0.1.0"} | {appInfo?.platform || "unknown"}
        </p>
        <div className="space-y-2 text-xs text-fg-2">
          <p>Click a connection in the sidebar to get started</p>
          <p>Or press <kbd className="px-1.5 py-0.5 bg-bg-3 rounded text-fg-1">+</kbd> to add a new connection</p>
        </div>
      </div>
    </div>
  );
}

export default App;
