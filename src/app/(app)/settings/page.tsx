"use client";

// Settings: playback (crossfade, autoplay, LUFS normalization), audio quality,
// appearance (accent color, density), and language.
import { Check } from "lucide-react";
import { cn, EQ_PRESETS } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { ACCENT_HEX, THEMES, useSettingsStore, type Accent, type Density, type Quality, type Theme } from "@/stores/settings-store";
import { useT, type DictKey } from "@/lib/i18n";

const QUALITIES: { id: Quality; label: DictKey; desc: DictKey }[] = [
  { id: "auto", label: "qAuto", desc: "qAutoDesc" },
  { id: "low", label: "qLow", desc: "qLowDesc" },
  { id: "high", label: "qHigh", desc: "qHighDesc" },
  { id: "lossless", label: "qLossless", desc: "qLosslessDesc" },
];

const ACCENTS: Accent[] = ["emerald", "rose", "violet", "cyan", "amber", "gold"];
const DENSITIES: { id: Density; label: DictKey }[] = [
  { id: "compact", label: "compact" },
  { id: "comfortable", label: "comfortable" },
  { id: "spacious", label: "spacious" },
];
const LANGS = ["en", "ar", "fr", "es", "tr", "ur"];
const THEME_IDS = Object.keys(THEMES) as Theme[];

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-4 last:border-0">
      <div className="min-w-56">
        <p className="text-sm font-semibold">{label}</p>
        {desc && <p className="mt-0.5 text-xs text-white/40">{desc}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">{title}</h2>
      <div className="glass-panel divide-y divide-white/[0.05] rounded-2xl">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const t = useT();
  const crossfadeSec = usePlayerStore((s) => s.crossfadeSec);
  const setCrossfade = usePlayerStore((s) => s.setCrossfade);
  const eqBands = usePlayerStore((s) => s.eqBands);
  const setEqBands = usePlayerStore((s) => s.setEqBands);
  const s = useSettingsStore();

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="px-1 text-3xl font-black tracking-tight">{t("settingsTitle")}</h1>
      <p className="mt-1 px-1 text-sm text-white/40">{t("settingsSub")}</p>

      <Section title={t("playback")}>
        <Row label={t("crossfade")} desc={`${crossfadeSec}s · ${t("crossfadeDesc")}`}>
          <input
            type="range"
            min={0}
            max={15}
            step={1}
            value={crossfadeSec}
            onChange={(e) => setCrossfade(Number(e.target.value))}
            dir="ltr"
            className="aura-range w-44"
            style={{ ["--fill" as string]: `${(crossfadeSec / 15) * 100}%` }}
            aria-label="Crossfade seconds"
          />
          <span className="w-10 text-right font-mono text-xs text-white/60">{crossfadeSec}s</span>
        </Row>
        <Row label={t("autoplay")} desc={t("autoplayDesc")}>
          <Toggle on={s.autoplay} onChange={s.setAutoplay} />
        </Row>
        <Row label={t("loudness")} desc={t("loudnessDesc")}>
          <Toggle on={s.loudnessNormalization} onChange={s.setLoudnessNormalization} />
        </Row>
        <Row label={t("lyricsScroll")} desc={t("lyricsScrollDesc")}>
          <Toggle on={s.lyricsAutoScroll} onChange={s.setLyricsAutoScroll} />
        </Row>
        <Row label={t("backgroundPlayback")} desc={t("backgroundPlaybackDesc")}>
          <Toggle on={s.backgroundPlayback} onChange={s.setBackgroundPlayback} />
        </Row>
        <Row label={t("autoOffline")} desc={t("autoOfflineDesc")}>
          <Toggle on={s.autoOfflineLibrary} onChange={s.setAutoOfflineLibrary} />
        </Row>
        <Row label={t("lowData")} desc={t("lowDataDesc")}>
          <Toggle on={s.dataSaver} onChange={s.setDataSaver} />
        </Row>
        <Row label={t("eqPreset")} desc={t("eqPresetDesc")}>
          <select
            value={Object.keys(EQ_PRESETS).find((k) => JSON.stringify(EQ_PRESETS[k]) === JSON.stringify(eqBands)) ?? "custom"}
            onChange={(e) => {
              const preset = EQ_PRESETS[e.target.value];
              if (preset) setEqBands(preset);
            }}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-white/80 outline-none"
          >
            {Object.keys(EQ_PRESETS).map((k) => (
              <option key={k} value={k} className="bg-neutral-900">
                {k}
              </option>
            ))}
            <option value="custom" className="bg-neutral-900">
              {t("custom")}
            </option>
          </select>
        </Row>
      </Section>

      <Section title={t("audioQuality")}>
        {QUALITIES.map((q) => (
          <Row key={q.id} label={t(q.label)} desc={t(q.desc)}>
            <button
              onClick={() => s.setQuality(q.id)}
              className={cn(
                "grid size-6 place-items-center rounded-full border transition-colors",
                s.quality === q.id ? "border-[#1DB954] bg-[#1DB954] text-black" : "border-white/25 text-transparent hover:border-white/50",
              )}
              aria-label={t(q.label)}
            >
              <Check className="size-3.5" />
            </button>
          </Row>
        ))}
      </Section>

      <Section title={t("appearance")}>
        <Row label={t("themeLabel")} desc={t("themeDesc")}>
          <div className="flex flex-wrap gap-2">
            {THEME_IDS.map((id) => {
              const th = THEMES[id];
              return (
                <button
                  key={id}
                  onClick={() => s.setTheme(id)}
                  title={th.labelAr}
                  aria-label={th.label}
                  className={cn(
                    "group relative h-9 w-14 overflow-hidden rounded-xl border transition-transform hover:scale-105",
                    s.theme === id ? "border-[var(--app-accent)] ring-2 ring-[var(--app-accent)]/40" : "border-white/15",
                  )}
                  style={{ background: th.bg }}
                >
                  <span className="absolute inset-x-1.5 top-1.5 h-2 rounded-full" style={{ background: th.text, opacity: 0.85 }} />
                  <span className="absolute inset-x-1.5 top-[18px] h-1.5 rounded-full" style={{ background: th.muted }} />
                  <span className="absolute bottom-1.5 start-1.5 size-2.5 rounded-full" style={{ background: th.panel, border: `1px solid ${th.border}` }} />
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t("accentColor")} desc={t("accentDesc")}>
          <div className="flex items-center gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a}
                onClick={() => s.setAccent(a)}
                aria-label={`Accent ${a}`}
                className={cn(
                  "size-7 rounded-full transition-transform hover:scale-110",
                  s.accent === a && "ring-2 ring-white ring-offset-2 ring-offset-black",
                )}
                style={{ background: ACCENT_HEX[a] }}
              />
            ))}
          </div>
        </Row>
        <Row label={t("motion")} desc={t("motionDesc")}>
          <Toggle on={s.reducedEffects} onChange={s.setReducedEffects} />
        </Row>
        <Row label={t("highRefresh")} desc={t("highRefreshDesc")}>
          <Toggle on={s.highRefresh} onChange={s.setHighRefresh} />
        </Row>
        <Row label={t("haptics")} desc={t("hapticsDesc")}>
          <Toggle on={s.hapticsOnTap} onChange={s.setHapticsOnTap} />
        </Row>
        <Row label={t("density")}>
          <div className="flex gap-1 rounded-xl bg-black/40 p-1">
            {DENSITIES.map((d) => (
              <button
                key={d.id}
                onClick={() => s.setDensity(d.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  s.density === d.id ? "bg-white text-black" : "text-white/50 hover:text-white",
                )}
              >
                {t(d.label)}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title={t("language")}>
        <Row label={t("interfaceLang")} desc={t("interfaceLangDesc")}>
          <div className="flex flex-wrap gap-1.5">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => s.setLanguage(l)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-bold uppercase transition-colors",
                  s.language === l
                    ? "border-[#1DB954] bg-[#1DB954]/15 text-[#1DB954]"
                    : "border-white/10 text-white/50 hover:bg-white/8 hover:text-white",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <p className="mt-8 px-1 pb-6 text-center text-xs text-white/30">
        {t("shortcuts")}
      </p>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        on ? "bg-[#1DB954]" : "bg-white/15",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
          on ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}
