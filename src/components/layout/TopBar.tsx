import { localFetch } from "@/lib/local/client";

// Top bar: navigation history, live search (artists first), connection state,
// diagnostics shortcut and the account chip.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, X, BadgeCheck, Activity, WifiOff } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import type { SearchResultsDTO, UserDTO } from "@/lib/types";
import { playTrackNow } from "@/lib/player-actions";
import { usePlayerStore } from "@/stores/player-store";
import { useNetworkStore } from "@/stores/network-store";
import { useT } from "@/lib/i18n";
import { BrandIcon } from "@/components/brand/BrandIcon";

export function TopBar() {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResultsDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserDTO | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const online = useNetworkStore((s) => s.online);

  useEffect(() => {
    void localFetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u: UserDTO | null) => u && setUser(u))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!q.trim() || !online) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      localFetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: SearchResultsDTO | null) => {
          if (!data) return;
          setResults(data);
          setOpen(true);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, online]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const _playTrack = usePlayerStore((s) => s.playTrack);
  const totalResults = results
    ? results.tracks.length + results.albums.length + results.artists.length + results.playlists.length
    : 0;

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 px-1 sm:h-16 sm:gap-3 sm:px-2">
      <div className="hidden items-center gap-1.5 sm:flex">
        <button
          onClick={() => router.back()}
          className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-[color:var(--app-text)] transition-colors hover:bg-white/[0.12]"
          aria-label={t("back")}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </button>
        <button
          onClick={() => router.forward()}
          className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-[color:var(--app-text)] transition-colors hover:bg-white/[0.12]"
          aria-label={t("forward")}
        >
          <ArrowRight className="size-4 rtl:rotate-180" />
        </button>
      </div>

      <div ref={boxRef} className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-[color:var(--app-muted)]" />
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
          className="w-full rounded-full border border-[var(--app-border)] bg-white/[0.06] py-2.5 pe-9 ps-10 text-sm outline-none transition-colors placeholder:text-[color:var(--app-muted)] focus:border-white/25 focus:bg-white/[0.09]"
        />
        {q && (
          <button
            onClick={() => {
              setQ("");
              setResults(null);
            }}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-[color:var(--app-muted)] hover:text-[color:var(--app-text)]"
            aria-label="clear"
          >
            <X className="size-4" />
          </button>
        )}

        {open && results && q.trim() && (
          <div className="glass-modal aura-scroll absolute inset-x-0 top-12 max-h-[60vh] overflow-y-auto rounded-2xl p-2">
            {totalResults === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[color:var(--app-muted)]">
                {t("noResults")} “{q}”
              </p>
            )}
            {results.artists.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">
                  {t("artists")}
                </p>
                {results.artists.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      router.push(`/artists/${a.id}`);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-white/[0.08]"
                  >
                    {a.imageUrl ? (

                      <img src={a.imageUrl} alt="" className="size-9 rounded-full object-cover" />
                    ) : (
                      <span className="grid size-9 place-items-center rounded-full bg-white/10 text-xs font-bold">{a.name.slice(0, 1)}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-medium">
                        <span className="truncate">{a.name}</span>
                        {a.verified && <BadgeCheck className="size-3.5 shrink-0 text-sky-400" />}
                      </span>
                      <span className="flex items-center gap-1 truncate text-xs text-[color:var(--app-muted)]">
                        <BrandIcon name={a.source} color="brand" className="size-3" />
                        {formatCount(a.followers || a.monthlyListeners || 0)} {t("followers")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {results.tracks.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">
                  {t("tracks")}
                </p>
                {results.tracks.slice(0, 5).map((tr) => (
                  <button
                    key={tr.id}
                    onClick={() => {
                      playTrackNow(tr, { queue: results.tracks, index: results.tracks.findIndex((x) => x.id === tr.id) });
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-white/[0.08]"
                  >
                    {tr.coverUrl && (

                      <img src={tr.coverUrl} alt="" className="size-9 rounded-lg object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{tr.title}</span>
                      <span className="block truncate text-xs text-[color:var(--app-muted)]">{tr.artistName}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {results.albums.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">
                  {t("albums")}
                </p>
                {results.albums.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      router.push(`/albums/${a.id}`);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-white/[0.08]"
                  >
                    {a.coverUrl && (

                      <img src={a.coverUrl} alt="" className="size-9 rounded-lg object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="block truncate text-xs text-[color:var(--app-muted)]">{a.artistName}</span>
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
                className={cn("mt-1 w-full rounded-xl px-3 py-2.5 text-center text-[13px] font-semibold", "bg-white/[0.08] text-[color:var(--app-text)] transition-colors hover:bg-white/[0.14]")}
              >
                {t("seeAllResults")} “{q}”
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ms-auto flex shrink-0 items-center gap-1.5">
        {!online && (
          <span className="grid size-8 place-items-center rounded-full bg-amber-500/15 text-amber-300" title={t("offlineBanner")}>
            <WifiOff className="size-4" />
          </span>
        )}
        <Link
          href="/diagnostics"
          title={t("diagnostics")}
          aria-label={t("diagnostics")}
          className="hidden size-9 place-items-center rounded-full bg-white/[0.06] text-[color:var(--app-muted)] transition-colors hover:text-[color:var(--app-text)] sm:grid"
        >
          <Activity className="size-4" />
        </Link>
        {/* The user chip: an elegant gold-on-obsidian plate instead of the flat
            translucent box the user complained about. */}
        <div className="user-plate hidden items-center gap-2.5 py-1.5 pe-3.5 ps-1.5 sm:flex">
          <span className="relative grid place-items-center">
            {user?.avatarUrl ? (

              <img
                src={user.avatarUrl}
                alt={user.name}
                className="size-7 rounded-full object-cover ring-1 ring-[#d4af37]/60"
              />
            ) : (
              <span className="grid size-7 place-items-center rounded-full bg-[linear-gradient(140deg,#F6E7A8,#D4AF37_45%,#8C6B14)] text-[11px] font-black text-[#1a1405] shadow-[0_2px_10px_-2px_rgba(212,175,55,0.8)]">
                {(user?.name ?? "D")[0]}
              </span>
            )}
          </span>
          <div className="leading-tight">
            <p className="flex items-center gap-1 text-[12.5px] font-semibold">
              <span className="gold-text">{user?.name ?? "Listener"}</span>
              {user?.tier === "ultimate" && <BadgeCheck className="size-3.5 text-[#d4af37]" />}
            </p>
            <p className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-[#d4af37]/75">
              DON MUSE · {user?.tier ?? "free"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
