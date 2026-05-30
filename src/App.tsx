import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    invoke<AppInfo>("get_app_info").then(setAppInfo);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-bg-1 text-fg-0 font-sans">
      {/* Sidebar */}
      <aside className="w-60 bg-bg-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-base font-semibold text-fg-0">
            {appInfo?.name || "Russh"}
          </h1>
          <p className="text-xs text-fg-2 mt-1">
            v{appInfo?.version || "0.1.0"}
          </p>
        </div>
        <div className="flex-1 p-3">
          <p className="text-xs text-fg-2">Connections</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Tab bar */}
        <div className="h-10 bg-bg-0 border-b border-border flex items-center px-2 gap-px">
          <div className="h-8 px-3 flex items-center text-xs text-fg-0 bg-bg-2 rounded-t-md">
            Terminal
          </div>
          <button className="h-8 w-8 flex items-center justify-center text-fg-2 hover:text-fg-0 hover:bg-bg-3 rounded-md text-sm">
            +
          </button>
        </div>

        {/* Terminal area */}
        <div className="flex-1 p-4">
          <div className="h-full bg-bg-0 rounded-lg border border-border p-4 font-mono text-sm text-fg-1">
            <p className="text-fg-2">Welcome to Russh</p>
            <p className="text-fg-2 mt-1">
              AI-native SSH client built with Tauri + React + Rust
            </p>
            <p className="text-fg-2 mt-2">
              Platform: {appInfo?.platform || "unknown"}
            </p>
          </div>
        </div>

        {/* Status bar */}
        <div className="h-7 bg-bg-0 border-t border-border flex items-center px-3 text-xs text-fg-2">
          <span>Not connected</span>
        </div>
      </main>
    </div>
  );
}

export default App;
