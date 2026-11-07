"use client";

// Right contextual panel with tabs: Lyrics / Queue / Visualizer / Info.
import Link from "next/link";
import { Mic2, ListMusic, AudioWaveform, Info, X, BadgeCheck, AudioLines } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn, formatCount, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { useUIStore, type RightPanelTab } from "@/stores/ui-store";
import { LyricsPanel } from "@/components/panel/LyricsPanel";
import { QueuePanel } from "@/components/panel/QueuePanel";
import { SpectrumVisualizer } from "@/components/player/SpectrumVisualizer";
import { useT, type DictKey } from "@/lib/i18n";

const TABS: { id: RightPanelTab; key: DictKey; icon: typeof Mic2 }[] = [
  { id: "lyrics", key: "lyrics", icon: Mic2 },
  { id: "queue", key: "queue", icon: ListMusic },
  { id: "viz", key: "visualizer", icon: AudioWaveform },
  { id: "info", key: "info", icon: Info },
];

function InfoTab() {
  const t = useT();
  const track = usePlayerStore((s) => s.currentTrack);
  const crossfadeSec = usePlayerStore((s) => s.crossfadeSec);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  if (!track) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-white/35">{t("lyricsEmpty")}</div>
    );
  }
  const rows: [string, string][] = [
    [t("source"), ({ youtube: "YouTube Music (full-length)", audius: "Audius", soundcloud: "SoundCloud", archive: "Internet Archive", spotify: "Spotify (full via YouTube match)", applemusic: "Apple Music (full via YouTube match)", deezer: "Deezer (full via YouTube match)", jamendo: "Jamendo (CC licensed)", bandcamp: "Bandcamp", dailymotion: "Dailymotion", odysee: "Odysee", radio: "Live radio", internal: "DON MUSE" } as Record<string, string>)[track.source] ?? track.source],
    [t("artist"), track.artistName],
    [t("album"), track.albumTitle ?? "—"],
    [t("genre"), track.genre],
    [t("year"), String(track.year)],
    ["BPM", String(Math.round(track.bpm))],
    ["Key", track.key ?? "—"],
    [t("duration"), formatTime(track.durationSec)],
    [t("codec"), `${track.codec.toUpperCase()} ${track.bitrate} kbps${track.lossless ? " · LOSSLESS" : ""}`],
    ["Loudness", `${track.loudnessLufs.toFixed(1)} LUFS`],
    ["ISRC", track.isrc ?? "—"],
    [t("crossfadeLabel"), `${crossfadeSec}s`],
    [t("speed"), `${playbackRate.toFixed(2)}×`],
    [t("plays"), formatCount(track.playCount)],
  ];
  const FeatureBar = ({ label, value }: { label: string; value: number }) => (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-white/45">
        <span>{label}</span>
        <span className="font-mono">{Math.round(value * 100)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#1DB954] via-[#00D4FF] to-[#FA2D55]"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
  return (
    <div className="aura-scroll h-full overflow-y-auto p-5">
      <div className="mb-5 flex items-center gap-4">
        {track.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.coverUrl} alt="" className="size-20 rounded-2xl object-cover shadow-xl" />
        ) : (
          <div className="grid size-20 place-items-center rounded-2xl bg-white/10">
            <AudioLines className="size-8 text-white/50" />
          </div>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-base font-extrabold">
            {track.title}
            {track.lossless && <BadgeCheck className="size-4 shrink-0 text-gold" />}
            {track.explicit && (
              <span className="rounded border border-white/30 px-1 text-[9px] font-bold text-white/60">E</span>
            )}
          </p>
          <Link href={`/artists/${track.artistId}`} className="text-sm text-white/50 hover:text-white hover:underline">
            {track.artistName}
          </Link>
          {track.albumId && (
            <Link href={`/albums/${track.albumId}`} className="block text-xs text-white/35 hover:text-white/70 hover:underline">
              {track.albumTitle}
            </Link>
          )}
        </div>
      </div>

      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("audioFeatures")}</p>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-4">
        <FeatureBar label={t("energy")} value={track.energy} />
        <FeatureBar label={t("valence")} value={track.valence} />
        <FeatureBar label={t("danceability")} value={track.danceability} />
        <FeatureBar label={t("acousticness")} value={track.acousticness} />
      </div>

      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("metadata")}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-2xl bg-white/[0.03] p-4">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-wider text-white/30">{k}</dt>
            <dd className="truncate text-[12.5px] font-medium text-white/80">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RightPanel() {
  const t = useT();
  const open = useUIStore((s) => s.rightPanelOpen);
  const tab = useUIStore((s) => s.rightPanelTab);
  const setTab = useUIStore((s) => s.setRightPanelTab);
  const setOpen = useUIStore((s) => s.setRightPanel);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="glass-panel z-20 flex w-[340px] shrink-0 flex-col overflow-hidden rounded-2xl"
        >
          <div className="flex items-center gap-1 border-b border-white/[0.06] p-2">
            {TABS.map((tb) => {
              const Icon = tb.icon;
              return (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-semibold transition-colors",
                    tab === tb.id ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t(tb.key)}
                </button>
              );
            })}
            <button
              onClick={() => setOpen(false)}
              className="grid size-8 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
              aria-label="Close panel"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {tab === "lyrics" && <LyricsPanel />}
            {tab === "queue" && <QueuePanel />}
            {tab === "viz" && (
              <div className="flex h-full flex-col gap-3 p-4">
                <SpectrumVisualizer className="h-44 w-full rounded-xl bg-white/[0.03]" />
                <p className="text-center font-mono text-[10px] text-white/30">
                  LIVE FFT SPECTRUM · Web Audio AnalyserNode · 2048-point
                </p>
                <InfoTab />
              </div>
            )}
            {tab === "info" && <InfoTab />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
