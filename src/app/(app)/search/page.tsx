"use client";

// ============================================================================
//  Search — artists and official profiles FIRST, then songs, albums, playlists.
//  Artist cards show real platform stats (followers / subscribers / verified)
//  right on the card, not hidden inside the profile.
// ============================================================================
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, BadgeCheck, Loader2, Sparkles, Video } from "lucide-react";
import { motion } from "framer-motion";
import { TrackList } from "@/components/tracks/TrackList";
import { AlbumCard, PlaylistCard } from "@/components/cards/Cards";
import { SectionRow } from "@/components/sections/SectionRow";
import type { ArtistDTO, SearchResultsDTO } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { BrandIcon, BRAND_LABEL } from "@/components/brand/BrandIcon";
import { formatCount } from "@/lib/utils";
import { FollowButton } from "@/components/artists/FollowButton";
import { YouTubeResults } from "@/components/search/YouTubeResults";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-[color:var(--app-muted)]">…</p>}>
      <SearchPageInner />
    </Suspense>
  );
}

const SOURCES = [
  { id: "all", label: null },
  // "YouTube" is the official Data API search (live + channels + playlists);
  // "YouTube Music" is the music catalog search below it.
  { id: "video", label: "YouTube" },
  { id: "youtube", label: "YouTube Music" },
  { id: "spotify", label: "Spotify" },
  { id: "applemusic", label: "Apple Music" },
  { id: "deezer", label: "Deezer" },
  { id: "audius", label: "Audius" },
  { id: "soundcloud", label: "SoundCloud" },
  { id: "archive", label: "Archive" },
  { id: "jamendo", label: "Jamendo" },
  { id: "bandcamp", label: "Bandcamp" },
  { id: "dailymotion", label: "Dailymotion" },
  { id: "odysee", label: "Odysee" },
] as const;

type SourceId = (typeof SOURCES)[number]["id"] | "video";

/** Big result card for an artist — real stats on the image, platform badges. */
function ArtistResult({ artist }: { artist: ArtistDTO }) {
  const t = useT();
  const followers = artist.official?.subscribers ?? (artist.followers ? formatCount(artist.followers) : null);
  const monthly = artist.official?.monthlyAudience ?? (artist.monthlyListeners ? `${formatCount(artist.monthlyListeners)} ${t("monthlyListeners")}` : null);
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <Link href={`/artists/${artist.id}`} className="block">
        <div className="relative aspect-[16/9] overflow-hidden">
          {artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.imageUrl}
              alt={artist.name}
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="grid size-full place-items-center bg-gradient-to-br from-white/15 to-white/5 text-3xl font-black">
              {artist.name.slice(0, 1)}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
          {/* platform + verification + followers over the photo */}
          <div className="absolute inset-x-2.5 top-2.5 flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white backdrop-blur">
              <BrandIcon name={artist.source} color="brand" className="size-3" />
              {BRAND_LABEL[artist.source] ?? artist.source}
            </span>
            {artist.verified && (
              <span className="flex items-center gap-1 rounded-full bg-sky-500/85 px-2 py-0.5 text-[9.5px] font-bold text-white backdrop-blur">
                <BadgeCheck className="size-3" /> {t("verified")}
              </span>
            )}
          </div>
          <div className="absolute inset-x-3 bottom-2.5">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-black text-white drop-shadow">
              <span className="truncate">{artist.name}</span>
              {artist.verified && <BadgeCheck className="size-4 shrink-0 text-sky-400" />}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-white/80">
              {followers && <span className="font-bold text-white">{followers}</span>}
              {monthly && <span className="opacity-80">· {monthly}</span>}
              {artist.official?.handle && <span className="opacity-70">· {artist.official.handle}</span>}
            </p>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="truncate text-[11.5px] text-[color:var(--app-muted)]">
          {artist.genres?.slice(0, 2).join(" · ") || t("artists")}
        </p>
        <FollowButton artistId={artist.id} initial={artist.following} size="sm" />
      </div>
    </motion.div>
  );
}

function SearchPageInner() {
  const t = useT();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [source, setSource] = useState<SourceId>("all");
  const [results, setResults] = useState<SearchResultsDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setQ(initialQ), [initialQ]);

  useEffect(() => {
    if (!q.trim() || source === "video") {
      setResults(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}&source=${source}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: SearchResultsDTO) => {
          setResults(data);
          setLoading(false);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setLoading(false);
          setError(e.message);
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, source]);

  const total = results
    ? results.tracks.length + results.albums.length + results.artists.length + results.playlists.length
    : 0;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3.5">
        <SearchIcon className="size-5 text-[color:var(--app-muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full bg-transparent text-lg font-medium outline-none placeholder:text-[color:var(--app-muted)]"
          autoFocus
        />
        {loading && <Loader2 className="size-4 animate-spin text-[color:var(--app-muted)]" />}
      </div>

      <div className="no-scrollbar mb-5 flex items-center gap-2 overflow-x-auto pb-1">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              source === s.id
                ? "border-[var(--app-accent)] bg-[var(--app-accent)]/15 text-[var(--app-accent)]"
                : "border-white/10 text-[color:var(--app-muted)] hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {s.id === "video" ? (
              <Video className="size-3.5" />
            ) : (
              s.id !== "all" && <BrandIcon name={s.id} color="brand" className="size-3.5" />
            )}
            {s.label ?? t("allSources")}
          </button>
        ))}
      </div>

      {q.trim() && source === "video" && <YouTubeResults query={q} />}

      {!q.trim() && (
        <div className="grid place-items-center py-16 text-center">
          <Sparkles className="mb-3 size-8 text-[var(--app-accent)]" />
          <p className="text-lg font-bold">{t("search")}</p>
          <p className="mt-1 max-w-md text-sm text-[color:var(--app-muted)]">{t("tryGenre")}</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose/30 bg-rose/10 p-4 text-[13px] text-rose-200">
          {t("dlFailed")}: {error}
        </div>
      )}

      {q.trim() && results && total === 0 && !loading && (
        <p className="py-10 text-center text-sm text-[color:var(--app-muted)]">
          {t("noResults")} “{q}”. {t("tryGenre")}
        </p>
      )}

      {/* ARTISTS FIRST */}
      {results && results.artists.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-3 flex items-center gap-2 px-1 text-xl font-extrabold tracking-tight">
            {t("artists")}
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[color:var(--app-muted)]">
              {results.artists.length}
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.artists.slice(0, 12).map((a) => (
              <ArtistResult key={a.id} artist={a} />
            ))}
          </div>
        </section>
      )}

      {results && results.tracks.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-3 px-1 text-xl font-extrabold tracking-tight">{t("tracks")}</h2>
          <TrackList tracks={results.tracks} playAll />
        </section>
      )}

      {results && results.albums.length > 0 && (
        <SectionRow title={t("albums")} subtitle="">
          {results.albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </SectionRow>
      )}

      {results && results.playlists.length > 0 && (
        <SectionRow title={t("playlists")} subtitle="">
          {results.playlists.map((p) => (
            <PlaylistCard key={p.id} playlist={p} />
          ))}
        </SectionRow>
      )}

      {results?.sources && total > 0 && (
        <p className="mt-6 text-center font-mono text-[10px] text-[color:var(--app-muted)]">
          {Object.entries(results.sources)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${k}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
