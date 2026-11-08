"use client";

// ============================================================================
//  Content sources panel — the provider registry, live.
//  Shows exactly what each source needs, whether it answers right now, what the
//  playback policy allows, and why it was chosen. No secrets are displayed.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, RefreshCw, ServerCog, XCircle, KeyRound } from "lucide-react";
import { useT } from "@/lib/i18n";

interface ProviderRow {
  id: string;
  label: string;
  kind: string;
  license: string;
  auth: string;
  selfHostable: boolean;
  free: boolean;
  env: string[];
  docs: string;
  why: string;
  fallbacks: string[];
  status: "healthy" | "degraded" | "down" | "unconfigured";
  latencyMs: number | null;
  detail: string;
  checkedAt: number;
  playback: "official-embed" | "direct" | "link-out";
  background: boolean;
  download: boolean;
}

export function ProviderPanel() {
  const t = useT();
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/providers", { cache: "no-store" });
      const body = (await res.json()) as { providers?: ProviderRow[]; error?: string };
      if (!res.ok || !body.providers) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setRows(body.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unreachable");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const icon = (status: ProviderRow["status"]) => {
    if (status === "healthy") return <CheckCircle2 className="size-4 text-emerald-300" />;
    if (status === "degraded") return <AlertTriangle className="size-4 text-amber-300" />;
    if (status === "unconfigured") return <KeyRound className="size-4 text-sky-300" />;
    return <XCircle className="size-4 text-rose-300" />;
  };

  const tone = (status: ProviderRow["status"]) =>
    status === "healthy"
      ? "text-emerald-300"
      : status === "degraded"
        ? "text-amber-300"
        : status === "unconfigured"
          ? "text-sky-300"
          : "text-rose-300";

  const label = (status: ProviderRow["status"]) =>
    status === "healthy"
      ? t("healthy")
      : status === "degraded"
        ? t("degraded")
        : status === "unconfigured"
          ? t("providersUnconfigured")
          : t("down");

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[color:var(--app-muted)]">
          <ServerCog className="size-3.5" /> {t("providersTitle")}
        </h2>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="ms-auto flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1 text-[11px] font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} {t("healthCheck")}
        </button>
      </div>

      {error && <p className="mb-2 rounded-xl border border-rose/30 bg-rose/10 p-3 text-xs text-rose-200">{error}</p>}

      {!rows && busy && (
        <div className="grid place-items-center py-10 text-[color:var(--app-muted)]">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}

      <div className="grid gap-2">
        {(rows ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center gap-2">
              {icon(p.status)}
              <span className="text-[13px] font-bold">{p.label}</span>
              <span className={`text-[11px] font-bold ${tone(p.status)}`}>{label(p.status)}</span>
              {p.latencyMs !== null && (
                <span className="flex items-center gap-1 text-[10.5px] text-[color:var(--app-muted)]">
                  <Clock className="size-3" /> {p.latencyMs} ms
                </span>
              )}
              <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--app-muted)]">
                {p.kind}
              </span>
              <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--app-muted)]">
                {p.playback === "direct"
                  ? t("policyDirect")
                  : p.playback === "official-embed"
                    ? t("policyEmbed")
                    : t("policyLink")}
              </span>
              {p.selfHostable && (
                <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {t("providersSelfHosted")}
                </span>
              )}
              <a
                href={p.docs}
                target="_blank"
                rel="noreferrer"
                className="ms-auto flex items-center gap-1 text-[10.5px] font-semibold text-[color:var(--app-muted)] hover:text-white"
              >
                <ExternalLink className="size-3" /> docs
              </a>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/70">{p.why}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[10.5px] text-[color:var(--app-muted)]">
              <span>
                {t("providerLicense")}: {p.license}
              </span>
              {p.env.length > 0 && (
                <span className="font-mono">
                  {p.env.join(" · ")}
                </span>
              )}
              {p.fallbacks.length > 0 && <span>fallback → {p.fallbacks.join(" → ")}</span>}
              <span>{p.detail}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
