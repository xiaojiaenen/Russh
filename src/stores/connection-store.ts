import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig, createDefaultConnection } from "../types/connection";

export function useConnectionStore() {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const list = await invoke<ConnectionConfig[]>("list_connections");
      setConnections(list);
    } catch (e) {
      console.error("Failed to load connections:", e);
    }
  }, []);

  const saveConnection = useCallback(async (config: ConnectionConfig) => {
    try {
      await invoke("save_connection", { config });
      setConnections((prev) => {
        const idx = prev.findIndex((c) => c.id === config.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = config;
          return next;
        }
        return [...prev, config];
      });
    } catch (e) {
      console.error("Failed to save connection:", e);
    }
  }, []);

  const deleteConnection = useCallback(async (configId: string) => {
    try {
      await invoke("delete_connection", { configId });
      setConnections((prev) => prev.filter((c) => c.id !== configId));
    } catch (e) {
      console.error("Failed to delete connection:", e);
    }
  }, []);

  const connect = useCallback(async (config: ConnectionConfig) => {
    try {
      const sessionId = await invoke<string>("connect", { config });
      setActiveSessionId(sessionId);
      return sessionId;
    } catch (e) {
      console.error("Failed to connect:", e);
      throw e;
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (activeSessionId) {
      try {
        await invoke("disconnect", { sessionId: activeSessionId });
      } catch (e) {
        console.error("Failed to disconnect:", e);
      }
      setActiveSessionId(null);
    }
  }, [activeSessionId]);

  const testConnection = useCallback(async (config: ConnectionConfig) => {
    try {
      await invoke("test_connection", { config });
      return true;
    } catch (e) {
      console.error("Test connection failed:", e);
      return false;
    }
  }, []);

  return {
    connections,
    activeSessionId,
    loadConnections,
    saveConnection,
    deleteConnection,
    connect,
    disconnect,
    testConnection,
    createDefaultConnection,
  };
}
