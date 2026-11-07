// ============================================================================
//  DON MUSE — single persistent storage layer
//  ---------------------------------------------------------------------------
//  • Android app  → SharedPreferences inside the app's private internal
//                   storage (invisible to the file manager and other apps).
//  • Web / PWA    → IndexedDB (durable, far more space than localStorage,
//                   survives cache pressure) with a localStorage fallback.
//
//  One async KV interface is used by every Zustand store through the
//  `platformStorage` adapter below, so the same code powers both platforms.
// ============================================================================

import { nativeStore } from "@/lib/platform/native";

export interface KVStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

const DB_NAME = "donmuse-store";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
    req.onerror = () => resolve(null);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    try {
      localStorage.setItem(`dm:${key}`, value);
    } catch {
      /* quota */
    }
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  // Mirror the small "critical" keys into localStorage for instant synchronous
  // reads (theme/density applied before React hydrates → no visual flash).
  if (key === "aura-settings" || key === "aura-ui") {
    try {
      localStorage.setItem(`dm:${key}`, value);
    } catch {
      /* quota */
    }
  }
}

async function idbRemove(key: string): Promise<void> {
  try {
    localStorage.removeItem(`dm:${key}`);
  } catch {
    /* ignore */
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** localStorage fallback used when IndexedDB is unavailable (private mode). */
function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(`dm:${key}`) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const platformStorage: KVStorage = {
  async getItem(key) {
    // 1) Android app-private preferences
    if (nativeStore.available) {
      const v = nativeStore.get(key);
      if (v !== null) return v;
    }
    // 2) IndexedDB
    const fromIdb = await idbGet(key);
    if (fromIdb !== null) return fromIdb;
    // 3) Legacy localStorage (migrates transparently on first read)
    const legacy = lsGet(key);
    if (legacy !== null) {
      await this.setItem(key, legacy);
      return legacy;
    }
    return null;
  },
  async setItem(key, value) {
    if (nativeStore.available) {
      nativeStore.set(key, value);
      return;
    }
    await idbSet(key, value);
  },
  async removeItem(key) {
    if (nativeStore.available) {
      nativeStore.remove(key);
      return;
    }
    await idbRemove(key);
  },
};

/** Synchronous peek for pre-hydration styling (theme / density / language). */
export function peekSetting<T>(key: string, prop: string): T | null {
  try {
    const raw = nativeStore.available ? nativeStore.get(key) : localStorage.getItem(`dm:${key}`) ?? localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    return (parsed?.state?.[prop] as T) ?? null;
  } catch {
    return null;
  }
}
