export interface ConnectionConfig {
  id: string;
  name: string;
  group: string;
  host: string;
  port: number;
  auth: AuthMethod;
  username: string;
  keepalive_interval: number;
  timeout: number;
  encoding: string;
  terminal_type: string;
  tags: string[];
  notes: string;
  created_at: string;
  updated_at: string;
  last_connected_at: string | null;
}

export type AuthMethod =
  | { Password: { password: string } }
  | { KeyFile: { key_path: string; passphrase: string | null } }
  | { Certificate: { cert_path: string; key_path: string } }
  | "KeyboardInteractive";

export function createDefaultConnection(): ConnectionConfig {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    group: "default",
    host: "",
    port: 22,
    auth: { Password: { password: "" } },
    username: "root",
    keepalive_interval: 60,
    timeout: 10,
    encoding: "UTF-8",
    terminal_type: "xterm-256color",
    tags: [],
    notes: "",
    created_at: now,
    updated_at: now,
    last_connected_at: null,
  };
}
