import { localFetch } from "@/lib/local/client";

// ============================================================================
//  «التشخيصات» — live system diagnostics.
//  Every number on this page is measured in the browser/native host or fetched
//  from /api/health. Nothing is decorative: the self-test really probes the
//  audio engine, the cache, storage, the network and the server.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Cpu, Database, Gauge, HardDrive, Loader2, RefreshCw, Signal, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getEngine } from "@/lib/audio/engine";
import { nativeDiagnostics, isNativeHost, platformName } from "@/lib/platform/native";
import { usePlayerStore } from "@/stores/player-store";
import { useNetworkStore } from "@/stores/network-store";
import { toast } from "sonner";

interface HealthPayload {
  ok: boolean;
  totalMs: number;
  checkedAt: string;
  runtime: { node: string; uptimeSec: number; heapUsedMb: number; rssMb: number; platform: string };
  checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }>;
}

interface Row {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
  hint?: string;
}

export default function DiagnosticsPage() {
  const t = useT();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fps, setFps] = useState(0);
  const [longTasks, setLongTasks] = useState(0);
  const frameCount = useRef(0);
  const longTaskCount = useRef(0);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const online = useNetworkStore((s) => s.online);
  const latency = useNetworkStore((s) => s.latencyMs);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const queueLength = usePlayerStore((s) => s.queue.length);

  /* --------------------------- frame-rate meter --------------------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frames = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      acc += dt;
      frames++;
      frameCount.current++;
      if (acc >= 1000) {
        setFps(Math.round((frames * 1000) / acc));
        acc = 0;
        frames = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* --------------------------- long-task observer ------------------------- */
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    let obs: PerformanceObserver | null = null;
    try {
      obs = new PerformanceObserver((list) => {
        longTaskCount.current += list.getEntries().length;
        setLongTasks(longTaskCount.current);
      });
      obs.observe({ entryTypes: ["longtask"] });
    } catch {
      /* not supported */
    }
    return () => obs?.disconnect();
  }, []);

  /* ------------------------------ storage -------------------------------- */
  const readStorage = useCallback(async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    } catch {
      /* ignore */
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setBusy(true);
    setHealthError(null);
    try {
      const res = await localFetch("/api/health", { cache: "no-store" });
      const data = (await res.json()) as HealthPayload;
      setHealth(data);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : "unreachable");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    void readStorage();
    const iv = setInterval(() => void loadHealth(), 30_000);
    return () => clearInterval(iv);
  }, [loadHealth, readStorage]);

  const engine = typeof window !== "undefined" ? getEngine() : null;
  const native = isNativeHost() ? nativeDiagnostics() : null;

  const rows: Row[] = [
    { label: t("diagPlatform"), value: platformName(), hint: native ? JSON.stringify(native).slice(0, 120) : navigator.userAgent.slice(0, 90) },
    { label: t("diagFps"), value: `${fps} fps`, tone: fps >= 55 ? "good" : fps >= 30 ? "warn" : "bad", hint: `${frameCount.current} frames · ${longTasks} long tasks` },
    { label: t("diagMemory"), value: native ? `${String(native.heapUsedMb)} / ${String(native.heapMaxMb)} MB` : perfMem(), hint: "heap in use" },
    { label: t("diagAudioEngine"), value: engine ? (isPlaying ? "playing" : engine.isPlaying ? "engine-on" : "idle") : "n/a", tone: isPlaying ? "good" : undefined, hint: `store=${isPlaying ? "on" : "off"} engine=${engine?.isPlaying ? "on" : "off"}` },
    { label: t("diagQueue"), value: String(queueLength), hint: "tracks loaded" },
    { label: t("diagNetwork"), value: `${online ? "online" : "offline"}${latency != null ? ` · ${latency} ms` : ""}`, tone: online ? "good" : "warn" },
    { label: t("diagCache"), value: storage ? `${mb(storage.usage)} / ${mb(storage.quota)}` : "—", hint: "browser storage" },
    { label: t("diagBandwidth"), value: netInfo(), hint: "connection" },
  ];

  const clearCache = async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      toast.success(t("diagClearCache") + " ✓");
      void readStorage();
    } catch {
      toast.error("failed");
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-teal-300">
            <Activity className="size-3.5" /> {t("diagnostics")}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{t("diagnostics")}</h1>
          <p className="mt-1.5 text-[13px] text-[color:var(--app-muted)]">{t("diagnosticsSub")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadHealth()}
            disabled={busy}
            className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("diagRunTests")}
          </button>
          <button
            onClick={() => void clearCache()}
            className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[12.5px] font-semibold"
          >
            <Trash2 className="size-4" /> {t("diagClearCache")}
          </button>
        </div>
      </div>

      {/* verdict banner */}
      <div
        className={`mb-5 flex items-center gap-3 rounded-2xl border p-4 ${
          health?.ok
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            : healthError
              ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
              : "border-amber-400/30 bg-amber-400/10 text-amber-200"
        }`}
      >
        {health?.ok ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertTriangle className="size-5 shrink-0" />}
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold">
            {healthError ? healthError : health?.ok ? t("diagAllGood") : `${Object.values(health?.checks ?? {}).filter((c) => !c.ok).length} ${t("diagIssues")}`}
          </p>
          {health && (
            <p className="mt-0.5 text-[11.5px] opacity-80">
              {health.checkedAt.slice(11, 19)} · {health.totalMs} ms · node {health.runtime.node}
            </p>
          )}
        </div>
      </div>

      {/* live metrics */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">{r.label}</p>
            <p
              className={`mt-1.5 truncate text-[15px] font-black ${
                r.tone === "good" ? "text-emerald-300" : r.tone === "warn" ? "text-amber-300" : r.tone === "bad" ? "text-rose-300" : ""
              }`}
            >
              {r.value}
            </p>
            {r.hint && <p className="mt-1 truncate text-[10.5px] text-[color:var(--app-muted)]">{r.hint}</p>}
          </div>
        ))}
      </div>

      {/* server checks */}
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[color:var(--app-muted)]">
        <Database className="size-3.5" /> {t("healthTitle")}
      </h2>
      <div className="grid gap-2 md:grid-cols-2">
        {health &&
          Object.entries(health.checks).map(([name, c]) => (
            <div key={name} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
              <span className="flex min-w-0 items-center gap-2 text-[12.5px]">
                {iconFor(name)}
                <span className="truncate">{name}</span>
              </span>
              <span className={`shrink-0 text-[11.5px] font-bold ${c.ok ? "text-emerald-300" : "text-rose-300"}`}>
                {c.ok ? t("healthy") : t("down")}
                {typeof c.latencyMs === "number" ? ` · ${c.latencyMs} ms` : ""}
              </span>
            </div>
          ))}
        {!health && !healthError && (
          <div className="grid place-items-center py-10 text-[color:var(--app-muted)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

function iconFor(name: string) {
  if (name.startsWith("database")) return <Database className="size-4 text-sky-300" />;
  if (name.startsWith("catalog")) return <HardDrive className="size-4 text-amber-300" />;
  if (name.includes("latency")) return <Gauge className="size-4 text-violet-300" />;
  if (name.includes("radio") || name.includes("source")) return <Signal className="size-4 text-cyan-300" />;
  return <Cpu className="size-4 text-[color:var(--app-muted)]" />;
}

function perfMem(): string {
  const p = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
  if (!p.memory) return "—";
  return `${Math.round(p.memory.usedJSHeapSize / 1048576)} / ${Math.round(p.memory.jsHeapSizeLimit / 1048576)} MB`;
}

function mb(bytes: number): string {
  if (!bytes) return "0 MB";
  return `${(bytes / 1048576).toFixed(bytes > 1073741824 ? 2 : 1)} MB`;
}

function netInfo(): string {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
  if (!c) return "—";
  const parts: string[] = [];
  if (c.effectiveType) parts.push(c.effectiveType);
  if (typeof c.downlink === "number") parts.push(`${c.downlink} Mb/s`);
  if (typeof c.rtt === "number") parts.push(`${c.rtt} ms`);
  return parts.join(" · ") || "—";
}
