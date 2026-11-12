// Local-only persistence. No server, SQL database, analytics or cloud account.
// Android uses its private atomic JSON store; the browser uses localStorage.
import { nativeStore } from "@/lib/platform/native";

export interface KVStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

function localGet(key: string): string | null {
  try { return localStorage.getItem(`dm:${key}`) ?? localStorage.getItem(key); } catch { return null; }
}

export const platformStorage: KVStorage = {
  async getItem(key) {
    if (nativeStore.available) {
      const value = nativeStore.get(key);
      if (value !== null) return value;
    }
    return localGet(key);
  },
  async setItem(key, value) {
    if (nativeStore.available) {
      nativeStore.set(key, value);
      return;
    }
    // Quota errors are surfaced to the caller instead of pretending a save worked.
    localStorage.setItem(`dm:${key}`, value);
  },
  async removeItem(key) {
    if (nativeStore.available) nativeStore.remove(key);
    try { localStorage.removeItem(`dm:${key}`); localStorage.removeItem(key); } catch { /* private mode */ }
  },
};

export function peekSetting<T>(key: string, prop: string): T | null {
  try {
    const raw = nativeStore.available ? nativeStore.get(key) : localGet(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    return (parsed.state?.[prop] as T) ?? null;
  } catch { return null; }
}
