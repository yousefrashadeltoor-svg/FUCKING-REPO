
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

  return (
    <div className="glass-modal w-[380px] rounded-2xl p-4" dir="ltr">
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
      <p className="mt-2 text-center font-mono text-[10px] text-white/30">
        {t("eqSub")}
      </p>
      <p className="mt-1 text-center text-[10px] leading-snug text-white/35">
        {t("eqNote")}
      </p>
    </div>
  );
}
