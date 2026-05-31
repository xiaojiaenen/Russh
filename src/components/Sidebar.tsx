import { useState } from "react";
import { ConnectionConfig, createDefaultConnection } from "../types/connection";
import { ConnectionDialog } from "./ConnectionDialog";

interface SidebarProps {
  connections: ConnectionConfig[];
  onConnect: (config: ConnectionConfig) => void;
  onOpenSftp: (config: ConnectionConfig) => void;
  onOpenMonitor: (config: ConnectionConfig) => void;
  onOpenTunnel: (config: ConnectionConfig) => void;
  onSave: (config: ConnectionConfig) => void;
  onDelete: (configId: string) => void;
}

interface ContextMenu {
  x: number;
  y: number;
  config: ConnectionConfig;
}

export function Sidebar({ connections, onConnect, onOpenSftp, onOpenMonitor, onOpenTunnel, onSave, onDelete }: SidebarProps) {
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConnectionConfig | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  function handleNewConnection() {
    setEditingConfig(createDefaultConnection());
    setShowDialog(true);
  }

  function handleEdit(config: ConnectionConfig) {
    setEditingConfig({ ...config });
    setShowDialog(true);
    setContextMenu(null);
  }

  function handleSave(config: ConnectionConfig) {
    onSave(config);
    setShowDialog(false);
    setEditingConfig(null);
  }

  function handleContextMenu(e: React.MouseEvent, config: ConnectionConfig) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, config });
  }

  function closeContextMenu() {
    setContextMenu(null);
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
    <aside className="h-full bg-bg-0 border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-base font-semibold text-fg-0">Russh</h1>
          <button
            onClick={handleNewConnection}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 hover:bg-bg-3 rounded text-sm"
            title="新建连接"
          >
            +
          </button>
        </div>
        <input
          type="text"
          placeholder="搜索连接..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-8 px-2 bg-bg-2 border border-border rounded text-sm text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
        />
      </div>

      {/* Connection list */}
      <div className="flex-1 overflow-y-auto scroll p-2">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-3">
            <div className="flex items-center px-2 py-1 text-xs text-fg-2">
              <span className="mr-1">&#9662;</span>
              {group}
            </div>
            {items.map((config) => (
              <div
                key={config.id}
                className="flex items-center px-2 py-1.5 rounded hover:bg-bg-3 cursor-pointer"
                onClick={() => onConnect(config)}
                onContextMenu={(e) => handleContextMenu(e, config)}
              >
                <div className="w-2 h-2 rounded-full bg-success mr-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-fg-0 truncate">
                    {config.name || config.host}
                  </div>
                  <div className="text-xs text-fg-2 truncate">
                    {config.username}@{config.host}:{config.port}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {connections.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-fg-2">暂无连接</p>
            <button
              onClick={handleNewConnection}
              className="mt-2 text-sm text-accent hover:underline"
            >
              添加第一个连接
            </button>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            className="fixed z-50 bg-bg-2 border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => { onConnect(contextMenu.config); closeContextMenu(); }}
              className="w-full px-3 py-1.5 text-left text-sm text-fg-0 hover:bg-bg-3"
            >
              连接
            </button>
            <button
              onClick={() => { onOpenSftp(contextMenu.config); closeContextMenu(); }}
              className="w-full px-3 py-1.5 text-left text-sm text-fg-0 hover:bg-bg-3"
            >
              SFTP 文件管理
            </button>
            <button
              onClick={() => { onOpenMonitor(contextMenu.config); closeContextMenu(); }}
              className="w-full px-3 py-1.5 text-left text-sm text-fg-0 hover:bg-bg-3"
            >
              系统监控
            </button>
            <button
              onClick={() => { onOpenTunnel(contextMenu.config); closeContextMenu(); }}
              className="w-full px-3 py-1.5 text-left text-sm text-fg-0 hover:bg-bg-3"
            >
              端口转发
            </button>
            <div className="border-t border-border my-1" />
            <button
              onClick={() => handleEdit(contextMenu.config)}
              className="w-full px-3 py-1.5 text-left text-sm text-fg-0 hover:bg-bg-3"
            >
              编辑
            </button>
            <button
              onClick={() => { onDelete(contextMenu.config.id); closeContextMenu(); }}
              className="w-full px-3 py-1.5 text-left text-sm text-error hover:bg-bg-3"
            >
              删除
            </button>
          </div>
        </>
      )}

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
