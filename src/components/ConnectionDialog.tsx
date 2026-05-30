import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig } from "../types/connection";

interface ConnectionDialogProps {
  config: ConnectionConfig;
  onSave: (config: ConnectionConfig) => void;
  onCancel: () => void;
}

export function ConnectionDialog({ config, onSave, onCancel }: ConnectionDialogProps) {
  const [form, setForm] = useState<ConnectionConfig>({ ...config });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  function updateField<K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value, updated_at: new Date().toISOString() }));
  }

  function updateAuth(updates: Partial<{ password: string; key_path: string; passphrase: string }>) {
    setForm((prev) => {
      const auth = prev.auth;
      if (typeof auth === "object" && "Password" in auth) {
        return { ...prev, auth: { Password: { password: updates.password ?? auth.Password.password } } };
      }
      if (typeof auth === "object" && "KeyFile" in auth) {
        return {
          ...prev,
          auth: {
            KeyFile: {
              key_path: updates.key_path ?? auth.KeyFile.key_path,
              passphrase: updates.passphrase ?? auth.KeyFile.passphrase,
            },
          },
        };
      }
      return prev;
    });
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await invoke("test_connection", { config: form });
      setTestResult("Connection successful");
    } catch (e) {
      setTestResult(String(e));
    } finally {
      setTesting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  const isPasswordAuth = typeof form.auth === "object" && "Password" in form.auth;
  const isKeyAuth = typeof form.auth === "object" && "KeyFile" in form.auth;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-2 border border-border rounded-lg w-[480px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg-0">
            {config.name ? "Edit Connection" : "New Connection"}
          </h2>
          <button
            onClick={onCancel}
            className="w-6 h-6 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded"
          >
            X
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Name */}
          <div>
            <label className="block text-xs text-fg-1 mb-1">Connection Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="My Server"
              className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Host and Port */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-fg-1 mb-1">Host</label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => updateField("host", e.target.value)}
                placeholder="192.168.1.100"
                className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-fg-1 mb-1">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => updateField("port", parseInt(e.target.value) || 22)}
                className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs text-fg-1 mb-1">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => updateField("username", e.target.value)}
              placeholder="root"
              className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Auth method */}
          <div>
            <label className="block text-xs text-fg-1 mb-1">Authentication</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateField("auth", { Password: { password: "" } })}
                className={`px-3 py-1.5 text-xs rounded border ${
                  isPasswordAuth
                    ? "border-accent text-accent"
                    : "border-border text-fg-2 hover:text-fg-0"
                }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => updateField("auth", { KeyFile: { key_path: "", passphrase: null } })}
                className={`px-3 py-1.5 text-xs rounded border ${
                  isKeyAuth
                    ? "border-accent text-accent"
                    : "border-border text-fg-2 hover:text-fg-0"
                }`}
              >
                Key File
              </button>
            </div>
          </div>

          {/* Auth details */}
          {isPasswordAuth && (
            <div>
              <label className="block text-xs text-fg-1 mb-1">Password</label>
              <input
                type="password"
                value={(form.auth as { Password: { password: string } }).Password.password}
                onChange={(e) => updateAuth({ password: e.target.value })}
                className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
              />
            </div>
          )}

          {isKeyAuth && (
            <div>
              <label className="block text-xs text-fg-1 mb-1">Key File Path</label>
              <input
                type="text"
                value={(form.auth as { KeyFile: { key_path: string; passphrase: string | null } }).KeyFile.key_path}
                onChange={(e) => updateAuth({ key_path: e.target.value })}
                placeholder="~/.ssh/id_rsa"
                className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
              />
            </div>
          )}

          {/* Group */}
          <div>
            <label className="block text-xs text-fg-1 mb-1">Group</label>
            <input
              type="text"
              value={form.group}
              onChange={(e) => updateField("group", e.target.value)}
              placeholder="default"
              className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-fg-1 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              className="w-full px-2 py-1.5 bg-bg-1 border border-border rounded text-xs text-fg-0 placeholder:text-fg-2 focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`text-xs px-2 py-1.5 rounded ${
                testResult === "Connection successful"
                  ? "bg-success/10 text-success"
                  : "bg-error/10 text-error"
              }`}
            >
              {testResult}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !form.host}
            className="px-3 py-1.5 text-xs text-fg-2 border border-border rounded hover:bg-bg-3 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs text-fg-2 border border-border rounded hover:bg-bg-3"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-3 py-1.5 text-xs text-bg-0 bg-accent rounded hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
