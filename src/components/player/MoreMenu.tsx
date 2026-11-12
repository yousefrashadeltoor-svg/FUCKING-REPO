
// ============================================================================
//  MoreMenu — the "•••" playbar menu rendered in a portal and positioned
//  with viewport clamping, so it never overflows the window in RTL or on
//  narrow screens. Contains: panels (lyrics / queue / visualizer / info),
//  equalizer, playback mode (off / all / one / ×N custom), sleep timer with
//  presets + custom minutes, playback speed, and the About page link.
// ============================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Mic2, ListMusic, AudioWaveform, Info, SlidersHorizontal, MoonStar, Gauge, Repeat, Repeat1, Hash, Check, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { useUIStore, type RightPanelTab } from "@/stores/ui-store";
import { useT } from "@/lib/i18n";

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onOpenEq: () => void;
}

export function MoreMenu({ anchor, open, onClose, onOpenEq }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const [sub, setSub] = useState<"none" | "repeat" | "sleep" | "speed">("none");
  const [customRepeat, setCustomRepeat] = useState("5");
  const [customSleep, setCustomSleep] = useState("45");

  const repeat = usePlayerStore((s) => s.repeat);
  const repeatCount = usePlayerStore((s) => s.repeatCount);
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode);
  const setRepeatCount = usePlayerStore((s) => s.setRepeatCount);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const rightPanelOpen = useUIStore((s) => s.rightPanelOpen);
  const rightPanelTab = useUIStore((s) => s.rightPanelTab);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!sleepTimerEndsAt) {
      setRemaining(null);
      return;
    }
    const iv = setInterval(() => setRemaining(Math.max(0, sleepTimerEndsAt - Date.now())), 1000);
    return () => clearInterval(iv);
  }, [sleepTimerEndsAt]);

  // position: above the anchor, clamped inside the viewport (RTL-safe)
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = ref.current?.offsetWidth ?? 264;
      const margin = 8;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(margin, Math.min(window.innerWidth - w - margin, left));
      const bottom = window.innerHeight - r.top + 8;
      setPos({ left, bottom });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, sub]);

  // close on outside click / escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, onClose]);

  if (!open || typeof document === "undefined") return null;

  const openPanel = (tab: RightPanelTab) => {
    toggleRightPanel(tab);
    onClose();
  };

  const Item = ({ icon: Icon, label, active, onClick, right }: { icon: typeof Mic2; label: string; active?: boolean; onClick: () => void; right?: React.ReactNode }) => (
    <button onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-[13px] font-medium transition-colors hover:bg-white/8", active ? "text-white" : "text-white/70")}>
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {right}
      {active && !right && <span className="size-1.5 rounded-full bg-[#1DB954]" />}
    </button>
  );

  const Sub = ({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-start text-[12.5px] hover:bg-white/8", active ? "text-[#1DB954]" : "text-white/65 hover:text-white")}>
      {label}
      {active && <Check className="size-3.5" />}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      style={pos ? { left: pos.left, bottom: pos.bottom } : { opacity: 0 }}
      className="glass-modal fixed z-[80] w-[264px] max-w-[calc(100vw-16px)] rounded-2xl p-2 shadow-2xl"
      dir="auto"
    >
      <div className="aura-scroll max-h-[min(70vh,520px)] overflow-y-auto">
        <Item icon={Mic2} label={t("lyrics")} active={rightPanelOpen && rightPanelTab === "lyrics"} onClick={() => openPanel("lyrics")} />
        <Item icon={ListMusic} label={t("queue")} active={rightPanelOpen && rightPanelTab === "queue"} onClick={() => openPanel("queue")} />
        <Item icon={AudioWaveform} label={t("visualizer")} active={rightPanelOpen && rightPanelTab === "viz"} onClick={() => openPanel("viz")} />
        <Item icon={Info} label={t("info")} active={rightPanelOpen && rightPanelTab === "info"} onClick={() => openPanel("info")} />
        <div className="my-1.5 border-t border-white/[0.06]" />
        <Item icon={SlidersHorizontal} label={t("equalizer")} onClick={() => { onOpenEq(); onClose(); }} />

        {/* playback mode */}
        <Item
          icon={repeat === "one" || repeatCount > 0 ? Repeat1 : Repeat}
          label={t("playbackMode")}
          active={repeat !== "off" || repeatCount > 0}
          onClick={() => setSub(sub === "repeat" ? "none" : "repeat")}
          right={<span className="font-mono text-[10px] text-white/45">{repeatCount > 0 ? `×${repeatCount + 1}` : repeat === "off" ? "—" : repeat === "all" ? "∞" : "1"}</span>}
        />
        {sub === "repeat" && (
          <div className="mb-1 ms-6 flex flex-col gap-0.5">
            <Sub label={t("repeatOff")} active={repeat === "off" && repeatCount === 0} onClick={() => { setRepeatMode("off"); }} />
            <Sub label={t("repeatAll")} active={repeat === "all" && repeatCount === 0} onClick={() => { setRepeatMode("all"); }} />
            <Sub label={t("repeatOne")} active={repeat === "one" && repeatCount === 0} onClick={() => { setRepeatMode("one"); }} />
            {[2, 3, 5, 10].map((n) => (
              <Sub key={n} label={`${t("repeatTimes")}${n}`} active={repeatCount === n - 1} onClick={() => { setRepeatCount(n - 1); toast(`${t("repeatTimes")}${n}`); }} />
            ))}
            <div className="flex items-center gap-1.5 px-3 py-1" dir="ltr">
              <Hash className="size-3.5 text-white/40" />
              <input value={customRepeat} onChange={(e) => setCustomRepeat(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} inputMode="numeric" className="w-14 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-center font-mono text-xs outline-none focus:border-white/30" />
              <button onClick={() => { const n = Number(customRepeat); if (n >= 2) { setRepeatCount(n - 1); toast(`${t("repeatTimes")}${n}`); } }} className="rounded-md bg-white px-2.5 py-1 text-[11px] font-bold text-black">{t("set")}</button>
              {repeatCount > 0 && <span className="ms-auto font-mono text-[10px] text-[#1DB954]">{repeatCount} {t("remainingPlays")}</span>}
            </div>
          </div>
        )}

        {/* sleep timer */}
        <Item
          icon={MoonStar}
          label={t("sleepTimer")}
          active={!!sleepTimerEndsAt}
          onClick={() => setSub(sub === "sleep" ? "none" : "sleep")}
          right={remaining !== null ? <span className="font-mono text-[10px] text-amber">{formatTime(remaining / 1000)}</span> : undefined}
        />
        {sub === "sleep" && (
          <div className="mb-1 ms-6 flex flex-col gap-0.5">
            {[5, 10, 15, 30, 45, 60, 90].map((m) => (
              <Sub key={m} label={`${m} ${t("minutes")}`} onClick={() => { setSleepTimer(m * 60_000); toast(`${t("sleepSet")} ${m} ${t("minutes")}`); setSub("none"); }} />
            ))}
            <div className="flex items-center gap-1.5 px-3 py-1" dir="ltr">
              <MoonStar className="size-3.5 text-white/40" />
              <input value={customSleep} onChange={(e) => setCustomSleep(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} inputMode="numeric" placeholder={t("customMinutes")} className="w-16 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-center font-mono text-xs outline-none focus:border-white/30" />
              <span className="text-[10px] text-white/40">{t("minutes")}</span>
              <button onClick={() => { const m = Number(customSleep); if (m >= 1) { setSleepTimer(m * 60_000); toast(`${t("sleepSet")} ${m} ${t("minutes")}`); setSub("none"); } }} className="rounded-md bg-white px-2.5 py-1 text-[11px] font-bold text-black">{t("set")}</button>
            </div>
            {sleepTimerEndsAt && <Sub label={t("cancelTimer")} onClick={() => { setSleepTimer(null); setSub("none"); }} />}
          </div>
        )}

        {/* speed */}
        <Item icon={Gauge} label={t("speed")} active={playbackRate !== 1} onClick={() => setSub(sub === "speed" ? "none" : "speed")} right={<span className="font-mono text-[10px] text-white/45">{playbackRate}×</span>} />
        {sub === "speed" && (
          <div className="mb-1 ms-6 grid grid-cols-4 gap-1 px-2 py-1" dir="ltr">
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3].map((r) => (
              <button key={r} onClick={() => { setPlaybackRate(r); }} className={cn("rounded-lg px-2 py-1.5 font-mono text-[11px] hover:bg-white/10", playbackRate === r ? "bg-white text-black" : "text-white/65")}>{r}×</button>
            ))}
          </div>
        )}

        <div className="my-1.5 border-t border-white/[0.06]" />
        <Link href="/about" onClick={onClose} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/8">
          <UserRound className="size-4 shrink-0" /> {t("openDeveloper")}
        </Link>
      </div>
    </div>,
    document.body,
  );
}
