// ============================================================================
//  Real lyrics for ANY song.
//  1. lrclib.net — free, no key, provides SYNCED lyrics ([mm:ss.xx] LRC) and
//     plain text for millions of tracks (matched by artist + title + duration).
//  2. lyrics.ovh — plain text fallback.
//  Synced lines are converted to { start, text } for the karaoke panel.
// ============================================================================
import type { LyricLine } from "@/lib/types";

function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (m.length === 0) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (!text) continue;
    for (const t of m) {
      const start = Number(t[1]) * 60 + Number(t[2]) + (t[3] ? Number(`0.${t[3]}`) : 0);
      out.push({ start: Number(start.toFixed(2)), text });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

interface LrclibHit {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9\u0600-\u06FF]/g, "");
}

export async function fetchRealLyrics(artist: string, title: string, durationSec: number): Promise<LyricLine[] | null> {
  // ---- 1. lrclib.net ----
  try {
    const clean = title.replace(/\(.*?\)|\[.*?\]/g, "").trim();
    const qs = new URLSearchParams({ track_name: clean, artist_name: artist.split(",")[0].trim() });
    if (durationSec > 0) qs.set("duration", String(Math.round(durationSec)));
    let res = await fetch(`https://lrclib.net/api/get?${qs}`, { headers: { "User-Agent": "DONMUSE/1.0" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    let hit: LrclibHit | null = res.ok ? ((await res.json()) as LrclibHit) : null;
    if (!hit) {
      const sres = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${clean} ${artist.split(",")[0]}` })}`, { headers: { "User-Agent": "DONMUSE/1.0" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (sres.ok) {
        const list = (await sres.json()) as LrclibHit[];
        const a = norm(artist);
        const t2 = norm(clean);
        hit = list.find((h) => norm(h.artistName ?? "").includes(a) && norm(h.trackName ?? "").includes(t2)) ?? list.find((h) => Math.abs((h.duration ?? 0) - durationSec) < 4 && norm(h.artistName ?? "").includes(a)) ?? list[0] ?? null;
      }
    }
    if (hit && !hit.instrumental) {
      if (hit.syncedLyrics) {
        const lines = parseLrc(hit.syncedLyrics);
        if (lines.length > 1) return lines;
      }
      if (hit.plainLyrics) {
        const lines = hit.plainLyrics.split("\n").map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
        if (lines.length > 0) {
          const dur = durationSec > 0 ? durationSec : lines.length * 4;
          const step = dur / lines.length;
          return lines.map((text, i) => ({ start: Number((i * step + step * 0.15).toFixed(2)), text }));
        }
      }
    }
  } catch {
    /* fall through */
  }
  // ---- 2. lyrics.ovh ----
  try {
    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { lyrics?: string };
    if (!data.lyrics) return null;
    const lines = data.lyrics.split("\n").map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
    if (lines.length === 0) return null;
    const dur = durationSec > 0 ? durationSec : lines.length * 4;
    const step = dur / lines.length;
    return lines.map((text, i) => ({ start: Number((i * step + step * 0.15).toFixed(2)), text }));
  } catch {
    return null;
  }
}
