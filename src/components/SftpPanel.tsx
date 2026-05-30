import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SftpPanelProps {
  sessionId: string;
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  permissions: string;
  modified_at: string;
  is_symlink: boolean;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function SftpPanel({ sessionId }: SftpPanelProps) {
  const [remotePath, setRemotePath] = useState("/");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const entries = await invoke<FileEntry[]>("sftp_list_dir", {
        sessionId,
        path,
      });
      setFiles(entries);
      setRemotePath(path);
      setSelected(new Set());
    } catch (e) {
      console.error("Failed to load files:", e);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadFiles("/");
  }, [loadFiles]);

  function handleDoubleClick(entry: FileEntry) {
    if (entry.is_dir) {
      loadFiles(entry.path);
    }
  }

  function handleSelect(name: string, ctrlKey: boolean) {
    setSelected((prev) => {
      const next = new Set(ctrlKey ? prev : []);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function handleDelete() {
    for (const name of selected) {
      const entry = files.find((f) => f.name === name);
      if (entry) {
        invoke("sftp_delete", {
          sessionId,
          path: entry.path,
          isDir: entry.is_dir,
        }).then(() => loadFiles(remotePath));
      }
    }
  }

  function handleMkdir() {
    const name = prompt("文件夹名称:");
    if (name) {
      invoke("sftp_mkdir", {
        sessionId,
        path: `${remotePath}/${name}`,
      }).then(() => loadFiles(remotePath));
    }
  }

  const pathParts = remotePath.split("/").filter(Boolean);

  return (
    <div className="h-full flex flex-col bg-bg-1">
      {/* Toolbar */}
      <div className="h-10 border-b border-border flex items-center px-3 gap-2">
        <button
          onClick={() => {
            const parent = pathParts.length > 1
              ? "/" + pathParts.slice(0, -1).join("/")
              : "/";
            loadFiles(parent);
          }}
          disabled={remotePath === "/"}
          className="h-6 px-2 text-xs text-fg-2 border border-border rounded hover:bg-bg-3 disabled:opacity-50"
        >
          返回
        </button>
        <button
          onClick={() => loadFiles(remotePath)}
          className="h-6 px-2 text-xs text-fg-2 border border-border rounded hover:bg-bg-3"
        >
          刷新
        </button>
        <button
          onClick={handleMkdir}
          className="h-6 px-2 text-xs text-fg-2 border border-border rounded hover:bg-bg-3"
        >
          新建文件夹
        </button>
        {selected.size > 0 && (
          <button
            onClick={handleDelete}
            className="h-6 px-2 text-xs text-error border border-error/30 rounded hover:bg-error/10"
          >
            删除 ({selected.size})
          </button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-fg-2">{remotePath}</span>
      </div>

      {/* Breadcrumb */}
      <div className="h-8 border-b border-border flex items-center px-3 gap-1 overflow-x-auto">
        <button
          onClick={() => loadFiles("/")}
          className="text-xs text-accent hover:underline flex-shrink-0"
        >
          /
        </button>
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center flex-shrink-0">
            <span className="text-xs text-fg-2 mx-1">/</span>
            <button
              onClick={() => {
                const path = "/" + pathParts.slice(0, i + 1).join("/");
                loadFiles(path);
              }}
              className="text-xs text-accent hover:underline"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto scroll">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="spinner" />
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-fg-2 border-b border-border">
                <th className="text-left px-3 py-2 font-normal">名称</th>
                <th className="text-right px-3 py-2 font-normal w-24">大小</th>
                <th className="text-right px-3 py-2 font-normal w-32">修改时间</th>
                <th className="text-right px-3 py-2 font-normal w-24">权限</th>
              </tr>
            </thead>
            <tbody>
              {files.map((entry) => (
                <tr
                  key={entry.path}
                  className={`hover:bg-bg-3 cursor-pointer ${
                    selected.has(entry.name) ? "bg-accent-bg" : ""
                  }`}
                  onClick={(e) => handleSelect(entry.name, e.ctrlKey || e.metaKey)}
                  onDoubleClick={() => handleDoubleClick(entry)}
                >
                  <td className="px-3 py-1.5">
                    <span className={entry.is_dir ? "text-accent" : "text-fg-0"}>
                      {entry.is_dir ? "[D] " : "   "}
                    </span>
                    {entry.name}
                  </td>
                  <td className="text-right px-3 py-1.5 text-fg-2">
                    {entry.is_dir ? "-" : formatSize(entry.size)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-fg-2">
                    {entry.modified_at}
                  </td>
                  <td className="text-right px-3 py-1.5 text-fg-2 font-mono">
                    {entry.permissions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div className="h-6 border-t border-border flex items-center px-3 text-2xs text-fg-2">
        <span>{files.length} items</span>
        <span className="ml-2">
          {formatSize(files.reduce((acc, f) => acc + f.size, 0))}
        </span>
      </div>
    </div>
  );
}
