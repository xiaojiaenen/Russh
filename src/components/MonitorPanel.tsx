import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// Keyboard shortcuts:
// F5: Refresh data
// 1: Sort by CPU
// 2: Sort by Memory

interface MonitorPanelProps {
  sessionId: string;
}

interface CpuInfo {
  user: number;
  system: number;
  idle: number;
  total: number;
}

interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  available: number;
  swap_total: number;
  swap_used: number;
}

interface DiskInfo {
  filesystem: string;
  mount_point: string;
  total: number;
  used: number;
  available: number;
  use_percent: number;
}

interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-bg-3 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function MonitorPanel({ sessionId }: MonitorPanelProps) {
  const [cpu, setCpu] = useState<CpuInfo | null>(null);
  const [memory, setMemory] = useState<MemoryInfo | null>(null);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [sortField, setSortField] = useState<"cpu" | "mem">("cpu");

  const fetchData = useCallback(async () => {
    try {
      const [cpuData, memData, diskData, procData] = await Promise.all([
        invoke<CpuInfo>("get_cpu_usage", { sessionId }),
        invoke<MemoryInfo>("get_memory_usage", { sessionId }),
        invoke<DiskInfo[]>("get_disk_usage", { sessionId }),
        invoke<ProcessInfo[]>("get_process_list", { sessionId, sortBy: sortField, limit: 20 }),
      ]);
      setCpu(cpuData);
      setMemory(memData);
      setDisks(diskData);
      setProcesses(procData);
    } catch (e) {
      console.error("Failed to fetch monitor data:", e);
    }
  }, [sessionId, sortField]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const cpuUsage = cpu ? 100 - cpu.idle : 0;
  const memUsage = memory ? (memory.used / memory.total) * 100 : 0;
  const swapUsage = memory && memory.swap_total > 0
    ? (memory.swap_used / memory.swap_total) * 100
    : 0;

  return (
    <div className="h-full overflow-y-auto scroll bg-bg-1 p-4">
      <h2 className="text-sm font-semibold text-fg-0 mb-4">系统监控</h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* CPU */}
        <div className="bg-bg-0 border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-fg-1">CPU</span>
            <span className="text-xs text-fg-0 font-mono">{cpuUsage.toFixed(1)}%</span>
          </div>
          <ProgressBar value={cpuUsage} color="var(--accent)" />
          <div className="flex gap-4 mt-2 text-2xs text-fg-2">
            <span>用户: {cpu?.user.toFixed(1)}%</span>
            <span>系统: {cpu?.system.toFixed(1)}%</span>
          </div>
        </div>

        {/* Memory */}
        <div className="bg-bg-0 border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-fg-1">内存</span>
            <span className="text-xs text-fg-0 font-mono">{memUsage.toFixed(1)}%</span>
          </div>
          <ProgressBar value={memUsage} color="var(--info)" />
          <div className="flex gap-4 mt-2 text-2xs text-fg-2">
            <span>{formatBytes(memory?.used || 0)} / {formatBytes(memory?.total || 0)}</span>
          </div>
          {memory && memory.swap_total > 0 && (
            <>
              <div className="flex items-center justify-between mt-2 mb-1">
                <span className="text-2xs text-fg-2">Swap</span>
                <span className="text-2xs text-fg-2 font-mono">{swapUsage.toFixed(1)}%</span>
              </div>
              <ProgressBar value={swapUsage} color="var(--warning)" />
            </>
          )}
        </div>

        {/* Disk */}
        {disks.map((disk) => (
          <div key={disk.mount_point} className="bg-bg-0 border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-fg-1">{disk.mount_point}</span>
              <span className="text-xs text-fg-0 font-mono">{disk.use_percent.toFixed(1)}%</span>
            </div>
            <ProgressBar value={disk.use_percent} color="var(--success)" />
            <div className="flex gap-4 mt-2 text-2xs text-fg-2">
              <span>{formatBytes(disk.used)} / {formatBytes(disk.total)}</span>
              <span>可用: {formatBytes(disk.available)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Processes */}
      <div className="bg-bg-0 border border-border rounded-lg">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs text-fg-1">进程列表</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSortField("cpu")}
              className={`text-2xs px-2 py-0.5 rounded ${
                sortField === "cpu" ? "bg-accent text-bg-0" : "text-fg-2 hover:text-fg-0"
              }`}
            >
              CPU
            </button>
            <button
              onClick={() => setSortField("mem")}
              className={`text-2xs px-2 py-0.5 rounded ${
                sortField === "mem" ? "bg-accent text-bg-0" : "text-fg-2 hover:text-fg-0"
              }`}
            >
              MEM
            </button>
          </div>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-fg-2 border-b border-border">
              <th className="text-left px-3 py-1.5 font-normal">PID</th>
              <th className="text-left px-3 py-1.5 font-normal">User</th>
              <th className="text-right px-3 py-1.5 font-normal">CPU%</th>
              <th className="text-right px-3 py-1.5 font-normal">MEM%</th>
              <th className="text-left px-3 py-1.5 font-normal">Command</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((proc) => (
              <tr key={proc.pid} className="hover:bg-bg-3">
                <td className="px-3 py-1 text-fg-2">{proc.pid}</td>
                <td className="px-3 py-1 text-fg-2">{proc.user}</td>
                <td className="px-3 py-1 text-right text-fg-0">{proc.cpu.toFixed(1)}</td>
                <td className="px-3 py-1 text-right text-fg-0">{proc.mem.toFixed(1)}</td>
                <td className="px-3 py-1 text-fg-1 truncate max-w-[200px]">{proc.command}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
