import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TunnelPanelProps {
  sessionId: string;
}

interface TunnelInfo {
  id: string;
  tunnel_type: string;
  local_host: string;
  local_port: number;
  remote_host: string;
  remote_port: number;
  session_id: string;
  status: string;
  bytes_sent: number;
  bytes_received: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function TunnelPanel({ sessionId }: TunnelPanelProps) {
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [tunnelType, setTunnelType] = useState<"local" | "remote" | "dynamic">("local");
  const [localPort, setLocalPort] = useState("3306");
  const [remoteHost, setRemoteHost] = useState("localhost");
  const [remotePort, setRemotePort] = useState("3306");

  const loadTunnels = useCallback(async () => {
    try {
      const list = await invoke<TunnelInfo[]>("tunnel_list");
      setTunnels(list.filter((t) => t.session_id === sessionId));
    } catch (e) {
      console.error("Failed to load tunnels:", e);
    }
  }, [sessionId]);

  useEffect(() => {
    loadTunnels();
    const interval = setInterval(loadTunnels, 3000);
    return () => clearInterval(interval);
  }, [loadTunnels]);

  async function handleCreate() {
    try {
      if (tunnelType === "local") {
        await invoke("tunnel_create_local", {
          sessionId,
          localPort: parseInt(localPort),
          remoteHost,
          remotePort: parseInt(remotePort),
        });
      } else if (tunnelType === "remote") {
        await invoke("tunnel_create_remote", {
          sessionId,
          remotePort: parseInt(remotePort),
          localHost: "127.0.0.1",
          localPort: parseInt(localPort),
        });
      } else {
        await invoke("tunnel_create_dynamic", {
          sessionId,
          localPort: parseInt(localPort),
        });
      }
      setShowCreate(false);
      loadTunnels();
    } catch (e) {
      console.error("Failed to create tunnel:", e);
    }
  }

  async function handleClose(id: string) {
    try {
      await invoke("tunnel_close", { tunnelId: id });
      loadTunnels();
    } catch (e) {
      console.error("Failed to close tunnel:", e);
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg-1">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center px-3 gap-2">
        <span className="text-xs text-fg-1">Port Forwarding</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate(true)}
          className="h-6 px-2 text-xs text-bg-0 bg-accent rounded hover:opacity-90"
        >
          New Tunnel
        </button>
      </div>

      {/* Tunnel list */}
      <div className="flex-1 overflow-y-auto scroll">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-fg-2 border-b border-border">
              <th className="text-left px-3 py-2 font-normal">Type</th>
              <th className="text-left px-3 py-2 font-normal">Local</th>
              <th className="text-left px-3 py-2 font-normal">Remote</th>
              <th className="text-left px-3 py-2 font-normal">Status</th>
              <th className="text-right px-3 py-2 font-normal">Traffic</th>
              <th className="text-right px-3 py-2 font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {tunnels.map((tunnel) => (
              <tr key={tunnel.id} className="hover:bg-bg-3 border-b border-border">
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-[10px]">
                    {tunnel.tunnel_type.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-2 text-fg-0 font-mono">
                  {tunnel.local_host}:{tunnel.local_port}
                </td>
                <td className="px-3 py-2 text-fg-0 font-mono">
                  {tunnel.remote_host}:{tunnel.remote_port}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] ${tunnel.status === "running" ? "text-success" : "text-fg-2"}`}>
                    {tunnel.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-fg-2">
                  {formatBytes(tunnel.bytes_sent)} / {formatBytes(tunnel.bytes_received)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => handleClose(tunnel.id)}
                    className="text-[10px] text-fg-2 hover:text-error"
                  >
                    Stop
                  </button>
                </td>
              </tr>
            ))}
            {tunnels.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-fg-2">
                  No tunnels configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-2 border border-border rounded-lg w-[400px] p-4">
            <h3 className="text-sm font-semibold text-fg-0 mb-4">New Tunnel</h3>

            <div className="space-y-3">
              {/* Type */}
              <div>
                <label className="block text-xs text-fg-1 mb-1">Type</label>
                <div className="flex gap-2">
                  {(["local", "remote", "dynamic"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setTunnelType(type)}
                      className={`px-3 py-1.5 text-xs rounded border ${
                        tunnelType === type
                          ? "border-accent text-accent"
                          : "border-border text-fg-2 hover:text-fg-0"
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Local port */}
              <div>
                <label className="block text-xs text-fg-1 mb-1">Local Port</label>
                <input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)}
                  className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
                />
              </div>

              {/* Remote host/port (not for dynamic) */}
              {tunnelType !== "dynamic" && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-fg-1 mb-1">Remote Host</label>
                    <input
                      type="text"
                      value={remoteHost}
                      onChange={(e) => setRemoteHost(e.target.value)}
                      className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs text-fg-1 mb-1">Remote Port</label>
                    <input
                      type="number"
                      value={remotePort}
                      onChange={(e) => setRemotePort(e.target.value)}
                      className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-xs text-fg-2 border border-border rounded hover:bg-bg-3"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-3 py-1.5 text-xs text-bg-0 bg-accent rounded hover:opacity-90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
