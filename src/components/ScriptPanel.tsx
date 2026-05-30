import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Keyboard shortcuts:
// Ctrl+N: New script
// Ctrl+E: Edit selected script
// Delete: Delete selected script
// Enter: Execute selected script

interface ScriptPanelProps {
  onExecute: (command: string) => void;
}

interface ScriptEntry {
  id: string;
  name: string;
  content: string;
  language: string;
  category: string;
  created_at: string;
  last_used_at: string | null;
  use_count: number;
}

export function ScriptPanel({ onExecute }: ScriptPanelProps) {
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    content: "",
    language: "shell",
    category: "general",
  });

  useEffect(() => {
    loadScripts();
  }, []);

  async function loadScripts() {
    try {
      const list = await invoke<ScriptEntry[]>("script_list");
      setScripts(list);
    } catch (e) {
      console.error("Failed to load scripts:", e);
    }
  }

  async function handleSave() {
    try {
      const now = new Date().toISOString();
      await invoke("script_save", {
        script: {
          ...editForm,
          id: editForm.id || crypto.randomUUID(),
          created_at: editForm.id
            ? scripts.find((s) => s.id === editForm.id)?.created_at || now
            : now,
          last_used_at: null,
          use_count: 0,
        },
      });
      setShowEditor(false);
      loadScripts();
    } catch (e) {
      console.error("Failed to save script:", e);
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("script_delete", { scriptId: id });
      if (selectedId === id) setSelectedId(null);
      loadScripts();
    } catch (e) {
      console.error("Failed to delete script:", e);
    }
  }

  function handleExecute(script: ScriptEntry) {
    onExecute(script.content);
  }

  function handleEdit(script?: ScriptEntry) {
    if (script) {
      setEditForm({
        id: script.id,
        name: script.name,
        content: script.content,
        language: script.language,
        category: script.category,
      });
    } else {
      setEditForm({ id: "", name: "", content: "", language: "shell", category: "general" });
    }
    setShowEditor(true);
  }

  const selected = scripts.find((s) => s.id === selectedId);

  return (
    <div className="h-full flex bg-bg-1">
      {/* Script list */}
      <div className="w-60 border-r border-border flex flex-col">
        <div className="h-10 border-b border-border flex items-center justify-between px-3">
          <span className="text-xs text-fg-1">Scripts</span>
          <button
            onClick={() => handleEdit()}
            className="w-5 h-5 flex items-center justify-center text-fg-2 hover:text-fg-0 rounded text-2xs"
          >
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scroll">
          {scripts.map((script) => (
            <div
              key={script.id}
              className={`px-3 py-2 cursor-pointer hover:bg-bg-3 ${
                selectedId === script.id ? "bg-accent-bg" : ""
              }`}
              onClick={() => setSelectedId(script.id)}
            >
              <div className="text-xs text-fg-0 truncate">{script.name}</div>
              <div className="text-2xs text-fg-2">{script.language} | {script.category}</div>
            </div>
          ))}
          {scripts.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-fg-2">
              No scripts saved
            </div>
          )}
        </div>
      </div>

      {/* Script detail */}
      <div className="flex-1 flex flex-col">
        {selected ? (
          <>
            <div className="h-10 border-b border-border flex items-center justify-between px-3">
              <span className="text-xs text-fg-0">{selected.name}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExecute(selected)}
                  className="h-6 px-2 text-2xs text-bg-0 bg-accent rounded hover:opacity-90"
                >
                  Execute
                </button>
                <button
                  onClick={() => handleEdit(selected)}
                  className="h-6 px-2 text-2xs text-fg-2 border border-border rounded hover:bg-bg-3"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="h-6 px-2 text-2xs text-error border border-error/30 rounded hover:bg-error/10"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="flex-1 p-3 overflow-auto">
              <pre className="text-xs text-fg-0 font-mono whitespace-pre-wrap bg-bg-0 p-3 rounded border border-border">
                {selected.content}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-fg-2">Select a script or create a new one</p>
          </div>
        )}
      </div>

      {/* Editor dialog */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-2 border border-border rounded-lg w-[500px] p-4">
            <h3 className="text-sm font-semibold text-fg-0 mb-4">
              {editForm.id ? "Edit Script" : "New Script"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-fg-1 mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-fg-1 mb-1">Language</label>
                  <select
                    value={editForm.language}
                    onChange={(e) => setEditForm((p) => ({ ...p, language: e.target.value }))}
                    className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 focus:outline-none"
                  >
                    <option value="shell">Shell</option>
                    <option value="python">Python</option>
                    <option value="perl">Perl</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-fg-1 mb-1">Category</label>
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full h-8 px-2 bg-bg-1 border border-border rounded text-xs text-fg-0 focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-fg-1 mb-1">Content</label>
                <textarea
                  value={editForm.content}
                  onChange={(e) => setEditForm((p) => ({ ...p, content: e.target.value }))}
                  rows={10}
                  className="w-full px-2 py-1.5 bg-bg-1 border border-border rounded text-xs text-fg-0 font-mono focus:outline-none focus:border-accent resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowEditor(false)}
                className="px-3 py-1.5 text-xs text-fg-2 border border-border rounded hover:bg-bg-3"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-xs text-bg-0 bg-accent rounded hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
