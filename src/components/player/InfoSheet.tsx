
// ============================================================================
//  InfoSheet — the track-information layer for the expanded player.
//  It renders in its OWN top layer (z-[90]) so it is always visible and
//  interactive, unlike the old version which appeared behind the page.
// ============================================================================
import { useEffect } from "react";
import Link from "next/link";
import { X, AudioLines, BadgeCheck, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { usePlayerStore } from "@/stores/player-store";
import { useUIStore } from "@/stores/ui-store";
import { formatCount, formatTime } from "@/lib/utils";
import { describeSource } from "@/lib/audio/controller";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-[color:var(--app-muted)]">{label}</dt>
      <dd className="truncate text-[12.5px] font-medium text-[color:var(--app-text)]">{value}</dd>
    </div>
  );
}

function FeatureBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-[color:var(--app-muted)]">
        <span>{label}</span>
        <span className="font-mono">{pct}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-rose-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function InfoSheet() {
  const t = useT();
  const open = useUIStore((s) => s.infoSheetOpen);
  const setOpen = useUIStore((s) => s.setInfoSheet);
  const track = usePlayerStore((s) => s.currentTrack);
  const playbackRate = usePlayerStore((s) => s.playbackRate);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && track && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[92] flex items-end justify-center bg-black/65 backdrop-blur-md sm:items-center"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-modal aura-scroll max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl"
          >
            <div className="mb-4 flex items-start gap-3">
              {track.coverUrl ? (

                <img src={track.coverUrl} alt="" className="size-20 shrink-0 rounded-2xl object-cover shadow-xl" />
              ) : (
                <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-white/10">
                  <AudioLines className="size-8 text-white/50" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-base font-extrabold text-[color:var(--app-text)]">
                  <span className="truncate">{track.title}</span>
                  {track.lossless && <BadgeCheck className="size-4 shrink-0 text-gold" />}
                </p>
                {track.source === "local" ? (
                  <p className="text-sm text-[color:var(--app-muted)]">{track.artistName}</p>
                ) : (
                  <Link href={`/artists/${track.artistId}`} className="text-sm text-[color:var(--app-muted)] hover:underline">
                    {track.artistName}
                  </Link>
                )}
                {track.albumId && (
                  <Link href={`/albums/${track.albumId}`} className="block text-xs text-[color:var(--app-muted)] hover:underline">
                    {track.albumTitle}
                  </Link>
                )}
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--app-muted)]">
                  <ExternalLink className="size-3" /> {describeSource(track)}
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label={t("closeAll")} className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/70 hover:bg-white/15">
                <X className="size-[18px]" />
              </button>
            </div>

            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">{t("audioFeatures")}</p>
            <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4">
              <FeatureBar label={t("energy")} value={track.energy} />
              <FeatureBar label={t("valence")} value={track.valence} />
              <FeatureBar label={t("danceability")} value={track.danceability} />
              <FeatureBar label={t("acousticness")} value={track.acousticness} />
            </div>

            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">{t("metadata")}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-white/[0.04] p-4">
              <Row label={t("source")} value={describeSource(track)} />
              <Row label={t("artist")} value={track.artistName} />
              <Row label={t("album")} value={track.albumTitle ?? "—"} />
              <Row label={t("genre")} value={track.genre || "—"} />
              <Row label={t("year")} value={track.year ? String(track.year) : "—"} />
              <Row label="BPM" value={track.bpm ? String(Math.round(track.bpm)) : "—"} />
              <Row label="Key" value={track.key ?? "—"} />
              <Row label={t("duration")} value={formatTime(track.durationSec)} />
              <Row label={t("codec")} value={`${(track.codec || "—").toUpperCase()} ${track.bitrate || ""}${track.lossless ? " · LOSSLESS" : ""}`} />
              <Row label="Loudness" value={`${(track.loudnessLufs || 0).toFixed(1)} LUFS`} />
              <Row label={t("speed")} value={`${playbackRate.toFixed(2)}×`} />
              <Row label={t("plays")} value={formatCount(track.playCount)} />
            </dl>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
