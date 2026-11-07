"use client";

// Top navigation bar: back/forward, live search field, user chip.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Search, X, BadgeCheck } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import type { SearchResultsDTO, UserDTO } from "@/lib/types";
import { usePlayerStore } from "@/stores/player-store";
import { useT } from "@/lib/i18n";

export function TopBar() {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResultsDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserDTO | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch("/api/me")
      .then((r) => r.json())
      .then((u: UserDTO) => setUser(u))
      .catch(() => {});
  }, []);

  // debounced live search
  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data: SearchResultsDTO) => {
          setResults(data);
          setOpen(true);
        })
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const totalResults = results
    ? results.tracks.length + results.albums.length + results.artists.length + results.playlists.length
    : 0;

  return (
    <header className="z-20 flex h-16 shrink-0 items-center gap-3 px-4">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => router.back()}
          className="grid size-9 place-items-center rounded-full bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Back"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </button>
        <button
          onClick={() => router.forward()}
          className="grid size-9 place-items-center rounded-full bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Forward"
        >
          <ArrowRight className="size-4 rtl:rotate-180" />
        </button>
      </div>

      {/* live search */}
      <div ref={boxRef} className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              router.push(`/search?q=${encodeURIComponent(q.trim())}`);
              setOpen(false);
              inputRef.current?.blur();
            }
            if (e.key === "Escape") {
              setQ("");
              setResults(null);
              setOpen(false);
            }
          }}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2.5 pe-9 ps-10 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-white/25 focus:bg-white/[0.09]"
        />
        {q && (
          <button
            onClick={() => {
              setQ("");
              setResults(null);
            }}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}

        {/* dropdown */}
        {open && results && q.trim() && (
          <div className="glass-modal absolute left-0 right-0 top-12 max-h-[420px] overflow-y-auto rounded-2xl p-2 aura-scroll">
            {totalResults === 0 && (
              <p className="px-3 py-6 text-center text-sm text-white/40">
                No results for “{q}” — try a genre like “techno” or “ambient”.
              </p>
            )}
            {results.tracks.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("tracks")}</p>
                {results.tracks.slice(0, 5).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      playTrack(t, { queue: results.tracks, index: results.tracks.findIndex((x) => x.id === t.id) });
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/8"
                  >
                    {t.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.coverUrl} alt="" className="size-9 rounded-lg object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="block truncate text-xs text-white/40">{t.artistName}</span>
                    </span>
                    <span className="text-[11px] text-white/30">{t.genre}</span>
                  </button>
                ))}
              </div>
            )}
            {results.albums.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("albums")}</p>
                {results.albums.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      router.push(`/albums/${a.id}`);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/8"
                  >
                    {a.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.coverUrl} alt="" className="size-9 rounded-lg object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="block truncate text-xs text-white/40">{a.artistName}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {results.artists.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("artists")}</p>
                {results.artists.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      router.push(`/artists/${a.id}`);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/8"
                  >
                    {a.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.imageUrl} alt="" className="size-9 rounded-full object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-white/40">{formatCount(a.monthlyListeners)} listeners</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {results.playlists.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("playlists")}</p>
                {results.playlists.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      router.push(`/playlists/${p.id}`);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/8"
                  >
                    {p.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className="size-9 rounded-lg object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.title}</span>
                      <span className="block truncate text-xs text-white/40">{p.trackCount} tracks</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {totalResults > 0 && (
              <button
                onClick={() => {
                  router.push(`/search?q=${encodeURIComponent(q.trim())}`);
                  setOpen(false);
                }}
                className={cn(
                  "mt-1 w-full rounded-xl px-3 py-2.5 text-center text-[13px] font-semibold",
                  "bg-white/8 text-white/80 transition-colors hover:bg-white/12",
                )}
              >
                See all results for “{q}”
              </button>
            )}
          </div>
        )}
      </div>

      {/* user chip */}
      <div className="ms-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.05] py-1.5 pe-3.5 ps-1.5">
        {user?.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name} className="size-7 rounded-full object-cover" />
        )}
        <div className="leading-tight">
          <p className="flex items-center gap-1 text-[12.5px] font-semibold">
            {user?.name ?? "Listener"}
            {user?.tier === "ultimate" && <BadgeCheck className="size-3.5 text-gold" />}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gold/90">
            DON MUSE · {user?.tier ?? "free"}
          </p>
        </div>
      </div>
    </header>
  );
}
