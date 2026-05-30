import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig, createDefaultConnection } from "../types/connection";
import { ConnectionDialog } from "./ConnectionDialog";

interface SidebarProps {
  onConnect: (config: ConnectionConfig) => void;
  activeSessionId: string | null;
}

export function Sidebar({ onConnect, activeSessionId: _activeSessionId }: SidebarProps) {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConnectionConfig | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  async function loadConnections() {
    try {
      const list = await invoke<ConnectionConfig[]>("list_connections");
      setConnections(list);
    } catch (e) {
      console.error("Failed to load connections:", e);
    }
  }

  async function handleSave(config: ConnectionConfig) {
    try {
      await invoke("save_connection", { config });
      await loadConnections();
      setShowDialog(false);
      setEditingConfig(null);
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }

  async function handleDelete(configId: string) {
    try {
      await invoke("delete_connection", { configId });
      await loadConnections();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  }

  function handleConnect(config: ConnectionConfig) {
    onConnect(config);
  }

  function handleEdit(config: ConnectionConfig) {
    setEditingConfig(config);
    setShowDialog(true);
  }

  function handleNewConnection() {
    setEditingConfig(createDefaultConnection());
    setShowDialog(true);
  }

  const filtered = connections.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.host.toLowerCase().includes(search.toLowerCase()) ||
      c.username.toLowerCase().includes(search.toLowerCase())
  );

  const groups = filtered.reduce<Record<string, ConnectionConfig[]>>((acc, c) => {
    const g = c.group || "default";
    if (!acc[g]) acc[g] = [];
    acc[g].push(c);
    return acc;
  }, {});

  return (
    <aside className="w-60 bg-bg-0 border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-semibold text-fg-0">Russh</h1>
          <button
            onClick={handleNewConnection}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 hover:bg-bg-3 rounded text-xs"
          >
            +
          </button>
        </div>
        <input
          type="text"
          placeholder="Search connections..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-7 px-2 bg-bg-2 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
        />
      </div>

      {/* Connection list */}
      <div className="flex-1 overflow-y-auto scroll p-2">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-3">
            <div className="flex items-center px-2 py-1 text-xs text-fg-2">
              <span className="mr-1 text-[10px]">&#9662;</span>
              {group}
            </div>
            {items.map((config) => (
              <div
                key={config.id}
                className="group flex items-center px-2 py-1.5 rounded hover:bg-bg-3 cursor-pointer"
                onClick={() => handleConnect(config)}
              >
                <div className="w-2 h-2 rounded-full bg-fg-2 mr-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-fg-0 truncate">
                    {config.name || config.host}
                  </div>
                  <div className="text-[10px] text-fg-2 truncate">
                    {config.username}@{config.host}:{config.port}
                  </div>
                </div>
                <div className="hidden group-hover:flex items-center gap-1 ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(config);
                    }}
                    className="w-5 h-5 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-[10px]"
                  >
                    E
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(config.id);
                    }}
                    className="w-5 h-5 flex items-center justify-center text-fg-2 hover:text-error rounded text-[10px]"
                  >
                    X
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {connections.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-fg-2">No connections yet</p>
            <button
              onClick={handleNewConnection}
              className="mt-2 text-xs text-accent hover:underline"
            >
              Add your first connection
            </button>
          </div>
        )}
      </div>

      {/* Connection dialog */}
      {showDialog && editingConfig && (
        <ConnectionDialog
          config={editingConfig}
          onSave={handleSave}
          onCancel={() => {
            setShowDialog(false);
            setEditingConfig(null);
          }}
        />
      )}
    </aside>
  );
}
