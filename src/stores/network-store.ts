// Network state (online/offline + measured throughput) shared across the app.
import { create } from "zustand";

interface NetworkState {
  online: boolean;
  /** rough rtt in ms, measured with a tiny HEAD ping */
  latencyMs: number | null;
  /** total bytes transferred by app-initiated fetches (approx) */
  bytesIn: number;
  setOnline: (v: boolean) => void;
  setLatency: (v: number | null) => void;
  addBytes: (n: number) => void;
}

export const useNetworkStore = create<NetworkState>()((set) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  latencyMs: null,
  bytesIn: 0,
  setOnline: (online) => set({ online }),
  setLatency: (latencyMs) => set({ latencyMs }),
  addBytes: (n) => set((s) => ({ bytesIn: s.bytesIn + n })),
}));

/** Measure round-trip latency to our own API (cheap, no body). */
export async function pingLatency(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const start = performance.now();
  try {
    await fetch("/api/health", { method: "HEAD", cache: "no-store" });
    const ms = Math.round(performance.now() - start);
    useNetworkStore.getState().setLatency(ms);
    return ms;
  } catch {
    useNetworkStore.getState().setLatency(null);
    return null;
  }
}
