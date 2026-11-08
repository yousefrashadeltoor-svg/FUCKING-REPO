"use client";

// 10-band graphic equalizer panel with presets. Bands map to WebAudio
// BiquadFilter peaking nodes inside the UniversalPlaybackEngine.
import { X } from "lucide-react";
import { cn, EQ_BAND_FREQUENCIES, EQ_PRESETS } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { useT } from "@/lib/i18n";

interface Props {
  onClose: () => void;
}

const fmtFreq = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

export function EqualizerPanel({ onClose }: Props) {
  const t = useT();
  const eqBands = usePlayerStore((s) => s.eqBands);
  const setEqBands = usePlayerStore((s) => s.setEqBands);
  const setEqBand = usePlayerStore((s) => s.setEqBand);
  const bassBoost = usePlayerStore((s) => s.bassBoost);
  const setBassBoost = usePlayerStore((s) => s.setBassBoost);
  const preamp = usePlayerStore((s) => s.preamp);
  const setPreamp = usePlayerStore((s) => s.setPreamp);
  const balance = usePlayerStore((s) => s.balance);
  const setBalance = usePlayerStore((s) => s.setBalance);

  return (
    <div className="glass-modal w-[min(380px,92vw)] rounded-2xl p-4" dir="ltr">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">{t("equalizer")}</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white" aria-label="Close EQ">
          <X className="size-4" />
        </button>
      </div>

      {/* presets */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Object.entries(EQ_PRESETS).map(([name, bands]) => {
          const active = JSON.stringify(bands) === JSON.stringify(eqBands);
          return (
            <button
              key={name}
              onClick={() => setEqBands(bands)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                active
                  ? "bg-white text-black"
                  : "bg-white/8 text-white/60 hover:bg-white/15 hover:text-white",
              )}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* vertical band sliders */}
      <div className="flex items-start justify-between gap-1.5 rounded-xl bg-white/[0.03] p-3">
        {EQ_BAND_FREQUENCIES.map((f, i) => {
          const db = eqBands[i] ?? 0;
          // slider value 0..24 maps to -12..+12 dB; fill % from bottom
          const val = db + 12;
          const fill = (val / 24) * 100;
          return (
            <div key={f} className="flex w-6 flex-col items-center gap-1.5">
              <span className="h-24 w-full relative">
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={val}
                  onChange={(e) => setEqBand(i, Number(e.target.value) - 12)}
                  className="aura-eq absolute bottom-0 left-1/2 h-24 w-4 -translate-x-1/2 [writing-mode:vertical-lr]"
                  style={{ ["--fill" as string]: `${fill}%` }}
                  aria-label={`${fmtFreq(f)} Hz`}
                />
              </span>
              <span className="font-mono text-[9px] text-white/40">{fmtFreq(f)}</span>
              <span className={cn("font-mono text-[9px]", db !== 0 ? "text-cyan" : "text-white/30")}>
                {db > 0 ? `+${db}` : db}
              </span>
            </div>
          );
        })}
      </div>
      {/* bass / pre-amp / balance — real nodes in the audio graph */}
      <div className="mt-3 grid gap-2 rounded-xl bg-white/[0.03] p-3">
        <Row label={t("bassBoost")} value={`${bassBoost > 0 ? "+" : ""}${bassBoost} dB`}>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={bassBoost}
            onChange={(e) => setBassBoost(Number(e.target.value))}
            className="w-full accent-[var(--app-accent)]"
            aria-label={t("bassBoost")}
          />
        </Row>
        <Row label={t("preamp")} value={`${preamp > 0 ? "+" : ""}${preamp} dB`}>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={preamp}
            onChange={(e) => setPreamp(Number(e.target.value))}
            className="w-full accent-[var(--app-accent)]"
            aria-label={t("preamp")}
          />
        </Row>
        <Row
          label={t("balance")}
          value={balance === 0 ? t("center") : `${balance < 0 ? t("left") : t("right")} ${Math.round(Math.abs(balance) * 100)}%`}
        >
          <input
            type="range"
            min={-100}
            max={100}
            step={5}
            value={Math.round(balance * 100)}
            onChange={(e) => setBalance(Number(e.target.value) / 100)}
            className="w-full accent-[var(--app-accent)]"
            aria-label={t("balance")}
          />
        </Row>
      </div>
      <p className="mt-2 text-center font-mono text-[10px] text-white/30">
        {t("eqSub")}
      </p>
      <p className="mt-1 text-center text-[10px] leading-snug text-white/35">
        {t("eqNote")}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-2">
      <span className="text-[11px] font-semibold text-white/60">{label}</span>
      {children}
      <span className="text-end font-mono text-[10px] text-white/45">{value}</span>
    </label>
  );
}
