
// Time-synced lyrics: highlights the active line, auto-scrolls, click to seek.
import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useT } from "@/lib/i18n";

export function LyricsPanel() {
  const t = useT();
  const track = usePlayerStore((s) => s.currentTrack);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const seek = usePlayerStore((s) => s.seek);
  const autoScroll = useSettingsStore((s) => s.lyricsAutoScroll);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const lyrics = useMemo(() => track?.lyrics ?? [], [track?.lyrics]);

  const activeIndex = useMemo(() => {
    if (lyrics.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].start <= positionSec) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, positionSec]);

  // auto-scroll active line into center
  useEffect(() => {
    if (!autoScroll || activeIndex < 0) return;
    const el = lineRefs.current[activeIndex];
    const container = containerRef.current;
    if (el && container) {
      container.scrollTo({
        top: el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2,
        behavior: "smooth",
      });
    }
  }, [activeIndex, autoScroll]);

  if (!track) {
    return <EmptyState text={t("lyricsEmpty")} />;
  }
  if (lyrics.length === 0) {
    return <EmptyState text={`${t("lyricsNone")} — ${track.title}`} />;
  }

  return (
    <div ref={containerRef} className="aura-scroll h-full overflow-y-auto px-5 py-6">
      <h3 className="mb-1 text-lg font-extrabold tracking-tight">{track.title}</h3>
      <p className="mb-6 text-sm text-white/40">{track.artistName}</p>
      <div className="flex flex-col gap-4 pb-24">
        {lyrics.map((line, i) => (
          <motion.p
            key={i}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.4) }}
            onClick={() => seek(line.start)}
            className={cn(
              "lyric-line text-[17px] leading-snug",
              i === activeIndex ? "active" : i < activeIndex ? "past" : "future",
            )}
          >
            {line.text}
          </motion.p>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <p className="max-w-[240px] text-sm leading-relaxed text-white/35">{text}</p>
    </div>
  );
}
