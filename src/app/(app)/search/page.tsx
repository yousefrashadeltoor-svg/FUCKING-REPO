"use client";

// Full search page with debounced instant search across all entity types.
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { TrackList } from "@/components/tracks/TrackList";
import { AlbumCard, ArtistCard, PlaylistCard } from "@/components/cards/Cards";
import { SectionRow } from "@/components/sections/SectionRow";
import type { SearchResultsDTO } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { BrandIcon } from "@/components/brand/BrandIcon";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-white/40">Loading search…</p>}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const t = useT();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [source, setSource] = useState<"all" | "youtube" | "spotify" | "applemusic" | "deezer" | "audius" | "soundcloud" | "archive" | "jamendo" | "bandcamp" | "dailymotion" | "odysee">("all");
  const [results, setResults] = useState<SearchResultsDTO | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setQ(initialQ), [initialQ]);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(q.trim())}&source=${source}`)
        .then((r) => r.json())
        .then((data: SearchResultsDTO) => {
          setResults(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, source]);

  const total = results
    ? results.tracks.length + results.albums.length + results.artists.length + results.playlists.length
    : 0;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3.5">
        <SearchIcon className="size-5 text-white/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full bg-transparent text-lg font-medium text-white placeholder:text-white/30 outline-none"
          autoFocus
        />
        {loading && <span className="font-mono text-xs text-white/40">{t("loading")}</span>}
      </div>

      <div className="no-scrollbar mb-4 flex items-center gap-2 overflow-x-auto pb-1">
        {(
          [
            { id: "all", label: t("allSources") },
            { id: "youtube", label: t("youtubeMusic") },
            { id: "spotify", label: "Spotify" },
            { id: "applemusic", label: "Apple Music" },
            { id: "deezer", label: "Deezer" },
            { id: "audius", label: t("audius") },
            { id: "soundcloud", label: t("soundcloud") },
            { id: "archive", label: t("archive") },
            { id: "jamendo", label: "Jamendo" },
            { id: "bandcamp", label: "Bandcamp" },
            { id: "dailymotion", label: "Dailymotion" },
            { id: "odysee", label: "Odysee" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              source === s.id
                ? "border-[#1DB954] bg-[#1DB954]/15 text-[#1DB954]"
                : "border-white/10 text-white/50 hover:bg-white/8 hover:text-white"
            }`}
          >
            {s.id !== "all" && <BrandIcon name={s.id} color="brand" className="size-3.5" />}
            {s.label}
          </button>
        ))}
        {results?.sources && (
          <span className="ml-auto font-mono text-[10px] text-white/30">
            {Object.entries(results.sources).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(" · ")}
          </span>
        )}
      </div>

      {!q.trim() && (
        <div className="py-10 text-center">
          <p className="text-lg font-bold text-white/70">{t("search")}</p>
          <p className="mt-1 text-sm text-white/40">{t("tryGenre")}</p>
        </div>
      )}

      {q.trim() && results && total === 0 && !loading && (
        <p className="py-10 text-center text-sm text-white/40">{t("noResults")} “{q}”. {t("tryGenre")}</p>
      )}

      {results && results.tracks.length > 0 && (
        <section className="mt-2">
          <h2 className="mb-3 px-1 text-xl font-extrabold tracking-tight">{t("tracks")}</h2>
          <TrackList tracks={results.tracks} />
        </section>
      )}
      {results && results.albums.length > 0 && (
        <SectionRow title={t("albums")} subtitle="">
          {results.albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </SectionRow>
      )}
      {results && results.artists.length > 0 && (
        <SectionRow title={t("artists")} subtitle="">
          {results.artists.map((a) => (
            <ArtistCard key={a.id} artist={a} />
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
    </div>
  );
}
