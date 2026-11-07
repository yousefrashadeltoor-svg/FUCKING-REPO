// ============================================================================
//  Local clip library (IndexedDB) — "My Clips". Recorded radio clips are
//  stored as MP3 blobs on-device so the user can come back and play /
//  download / delete them later. Persisted in the browser (works inside the
//  Android WebView too).
// ============================================================================
export interface SavedClip {
  id: string;
  name: string;
  stationName: string;
  country: string;
  cover: string | null; // data URL
  start: number;
  end: number;
  seconds: number;
  savedAt: number;
  size: number;
  blob: Blob;
}

const DB = "donmuse";
const STORE = "clips";
const VER = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function addClip(c: SavedClip): Promise<SavedClip> {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(c);
    tx.oncomplete = () => { db.close(); res(c); };
    tx.onerror = () => rej(tx.error);
  });
}

export async function listClips(): Promise<SavedClip[]> {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const rq = tx.objectStore(STORE).getAll();
    rq.onsuccess = () => {
      const list = (rq.result as SavedClip[]).sort((a, b) => b.savedAt - a.savedAt);
      db.close();
      res(list);
    };
    rq.onerror = () => rej(rq.error);
  });
}

export async function deleteClip(id: string): Promise<void> {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror = () => rej(tx.error);
  });
}
