"use client";

// Developer / About page — Joseph M.R
import { motion } from "framer-motion";
import { Code2, Cpu, Radio, Tv, Download, Music2, Sparkles, WifiOff, Globe2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { BrandIcon } from "@/components/brand/BrandIcon";

const STACK = ["Next.js 16", "React 19", "TypeScript", "PostgreSQL · Drizzle", "Web Audio API", "hls.js", "yt-dlp", "ffmpeg 7", "Tailwind v4", "Framer Motion"];
const PLATFORMS = ["youtube", "spotify", "applemusic", "deezer", "audius", "soundcloud", "archive", "jamendo", "bandcamp", "dailymotion", "odysee"];

export default function AboutPage() {
  const t = useT();
  const features = [
    { icon: Music2, text: "YouTube Music · Spotify · Apple Music · Deezer · Audius · SoundCloud · Jamendo · Bandcamp · Dailymotion · Odysee · Internet Archive" },
    { icon: Download, text: "25+ download formats · FLAC/ALAC/WAV/MP3/AAC/Opus · cover art embedded" },
    { icon: Radio, text: "Live radio · Egypt first · visual clip recorder" },
    { icon: Tv, text: "Live TV · thousands of channels · quality control · PiP · record" },
    { icon: Sparkles, text: "AI playlists · Reels recommendation engine · follow artists · save albums" },
    { icon: WifiOff, text: t("offlineReady") },
  ];
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/developer.jpg" alt="Developer" className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">{t("developer")}</p>
          <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-6xl" style={{ textShadow: "0 4px 30px rgba(0,0,0,.8)" }}>Joseph M.R</h1>
          <p className="mt-2 max-w-xl text-sm text-white/75 sm:text-base">{t("developerSub")} <b className="text-white">Joseph M.R</b>.</p>
          <p className="mt-3 inline-block rounded-full border border-gold/40 bg-black/50 px-4 py-1.5 font-serif text-sm italic text-gold backdrop-blur">{t("developerQuote")}</p>
        </div>
      </motion.div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Cpu className="size-5 text-[#1DB954]" /> DON MUSE</h2>
          <ul className="mt-3 space-y-2.5">
            {features.map((f) => (
              <li key={f.text} className="flex items-start gap-3 text-[13.5px] text-white/75">
                <f.icon className="mt-0.5 size-4 shrink-0 text-[#1DB954]" /> {f.text}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{t("builtWith")}</p>
            <div className="flex flex-wrap gap-1.5">
              {STACK.map((s) => <span key={s} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">{s}</span>)}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="DON MUSE" className="size-14 rounded-2xl shadow-lg" />
              <div>
                <p className="text-lg font-black tracking-tight">DON MUSE</p>
                <p className="font-mono text-[11px] text-white/40">{t("version")} 4.0 · {new Date().getFullYear()}</p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-white/50"><Code2 className="size-3.5" /> Joseph M.R · {t("developer")}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-white/50"><Globe2 className="size-3.5" /> EN · AR · FR · ES · TR · UR</p>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{t("allSources")}</p>
            <div className="flex flex-wrap gap-3">
              {PLATFORMS.map((p) => (
                <span key={p} className="grid size-11 place-items-center rounded-xl bg-white/[0.06]" title={p}>
                  <BrandIcon name={p} color="brand" className="size-6" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
