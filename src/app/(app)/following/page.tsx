"use client";

// «المتابعات» — every artist / profile the user follows, in one place.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UserCheck, Users, Search, BadgeCheck, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import type { ArtistDTO } from "@/lib/types";
import { formatCount } from "@/lib/utils";
import { FollowButton } from "@/components/artists/FollowButton";
import { BrandIcon } from "@/components/brand/BrandIcon";

export default function FollowingPage() {
  const t = useT();
  const [artists, setArtists] = useState<ArtistDTO[] | null>(null);
  const [q, setQ] = useState("");

  const load = () => {
    setArtists(null);
    void fetch("/api/follows")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ArtistDTO[]) => setArtists(Array.isArray(d) ? d : []))
      .catch(() => setArtists([]));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!artists) return [];
    const n = q.trim().toLowerCase();
    if (!n) return artists;
    return artists.filter((a) => a.name.toLowerCase().includes(n));
  }, [artists, q]);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-rose-300">
            <UserCheck className="size-3.5" /> {t("followingTab")}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{t("followingTab")}</h1>
          <p className="mt-1.5 text-[13px] text-[color:var(--app-muted)]">{t("followingTabSub")}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--app-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2.5 pe-3 ps-9 text-[13px] outline-none focus:border-white/25"
          />
        </div>
      </div>

      {!artists && (
        <div className="grid place-items-center py-20 text-[color:var(--app-muted)]">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}

      {artists && artists.length === 0 && (
        <div className="grid place-items-center rounded-3xl border border-dashed border-white/12 p-14 text-center">
          <Users className="mb-3 size-9 text-[color:var(--app-muted)]" />
          <p className="text-[13.5px] text-[color:var(--app-muted)]">{t("followingEmpty")}</p>
          <Link href="/search" className="mt-4 rounded-full bg-[var(--app-text)] px-5 py-2 text-[12.5px] font-bold text-[var(--app-bg)]">
            {t("search")}
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.06]"
          >
            <Link href={`/artists/${a.id}`} className="relative shrink-0">
              {a.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.imageUrl} alt={a.name} className="size-14 rounded-full object-cover ring-2 ring-white/10" />
              ) : (
                <div className="grid size-14 place-items-center rounded-full bg-white/10 text-lg font-black">
                  {a.name.slice(0, 1)}
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/artists/${a.id}`} className="flex items-center gap-1 truncate text-[13.5px] font-bold hover:underline">
                <span className="truncate">{a.name}</span>
                {a.verified && <BadgeCheck className="size-3.5 shrink-0 text-sky-400" />}
              </Link>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-[color:var(--app-muted)]">
                <BrandIcon name={a.source} color="brand" className="size-3" />
                {formatCount(a.followers || a.monthlyListeners || 0)} {t("followers")}
              </p>
            </div>
            <FollowButton artistId={a.id} initial size="sm" onChange={(f) => !f && setArtists((prev) => (prev ?? []).filter((x) => x.id !== a.id))} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
