"use client";

// ============================================================================
//  Artist profile — OFFICIAL account: banner + avatar from the platform,
//  @handle, subscribers · monthly audience · total views (real numbers from
//  YouTube), official links, follow. Tabs: Popular (real play counts) ·
//  Albums · Singles & EPs · With artists · Videos (real view counts) · Live ·
//  Fans also like (monthly audience) — every row playable / downloadable.
// ============================================================================
import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Play, Shuffle, Film, Disc3, Users2, Flame, Sparkles, Loader2, Radio, Link2, Eye, Users, Headphones, MapPin, CalendarDays, Video, Share2, DownloadCloud } from "lucide-react";
import { enqueueTrack } from "@/stores/download-store";
import { toast } from "sonner";
import { links, shareUrl } from "@/lib/share";
import { motion } from "framer-motion";
import { cn, formatCount, formatTime } from "@/lib/utils";
import { useT, type DictKey } from "@/lib/i18n";
import { BrandIcon, BRAND_LABEL } from "@/components/brand/BrandIcon";
import { FollowButton } from "./FollowButton";
import { TrackList } from "@/components/tracks/TrackList";
import { AlbumCard, ArtistCard } from "@/components/cards/Cards";
import { playQueueNow } from "@/lib/player-actions";
import type { ArtistProfileDTO, OfficialVideoDTO } from "@/lib/types";

type TabId = "top" | "albums" | "singles" | "collabs" | "videos" | "live" | "related";
const TABS: { id: TabId; key: DictKey; icon: typeof Flame }[] = [
  { id: "top", key: "tabTop", icon: Flame },
  { id: "albums", key: "tabAlbums", icon: Disc3 },
  { id: "singles", key: "tabSingles", icon: Disc3 },
  { id: "collabs", key: "tabCollabs", icon: Users2 },
  { id: "videos", key: "tabVideos", icon: Film },
  { id: "live", key: "tabLive", icon: Radio },
  { id: "related", key: "tabRelated", icon: Sparkles },
];

export function ArtistProfile({ artistId, initial }: { artistId: number; initial: ArtistProfileDTO | null }) {
  const t = useT();
  const [data, setData] = useState<ArtistProfileDTO | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [tab, setTab] = useState<TabId>("top");

  useEffect(() => {
    void fetch(`/api/artists/${artistId}/profile`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ArtistProfileDTO | null) => {
        if (d) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [artistId]);

  if (!data) return <div className="grid min-h-[50vh] place-items-center text-sm text-white/40">{loading ? <Loader2 className="size-6 animate-spin" /> : "—"}</div>;
  const { artist, topTracks, topPlays, albums, singles, collaborations, videos, live, related, stats } = data;
  const o = artist.official;
  const platform = BRAND_LABEL[artist.source] ?? artist.source;
  const counts: Record<TabId, number> = { top: topTracks.length, albums: albums.length, singles: singles.length, collabs: collaborations.length, videos: videos.length, live: live.length, related: related.length };
  const visibleTabs = TABS.filter((tb) => counts[tb.id] > 0 || tb.id === "top");

  const VideoGrid = ({ items }: { items: OfficialVideoDTO[] }) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((v, i) => (
        <button key={v.track.id} onClick={() => playQueueNow(items.map((x) => x.track), i)} className="group relative overflow-hidden rounded-2xl bg-white/[0.03] text-start ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.07]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.track.sourceId ? `https://i.ytimg.com/vi/${v.track.sourceId}/hq720.jpg` : v.track.coverUrl ?? ""} alt="" className="aspect-video w-full object-cover" onError={(e) => { if (v.track.sourceId) (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${v.track.sourceId}/hqdefault.jpg`; }} />
          <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="grid size-14 place-items-center rounded-full bg-white text-black"><Play className="ms-0.5 size-6 fill-black" /></span>
          </span>
          <span className="absolute start-2 top-2"><BrandIcon name="youtubevideo" color="brand" className="size-5 drop-shadow" /></span>
          {v.views && <span className="absolute end-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white"><Eye className="size-3" /> {v.views}</span>}
          <div className="p-3">
            <p className="truncate text-[13px] font-bold">{v.track.title}</p>
            <p className="truncate text-[11px] text-white/45">{v.subtitle}</p>
          </div>
        </button>
      ))}
      {items.length === 0 && <p className="col-span-full py-10 text-center text-sm text-white/40">—</p>}
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      {/* hero — official banner */}
      <div className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
        {(o?.bannerUrl || artist.imageUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o?.bannerUrl ?? artist.imageUrl ?? ""} alt="" aria-hidden className={cn("absolute inset-0 h-full w-full object-cover", o?.bannerUrl ? "opacity-70" : "scale-110 opacity-40 blur-3xl")} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0e] via-[#0b0b0e]/75 to-black/30" />
        <div className="relative flex flex-col gap-5 p-6 pt-24 md:flex-row md:items-end md:p-8 md:pt-32">
          <div className="relative shrink-0">
            {artist.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artist.imageUrl} alt={artist.name} className="size-40 rounded-full object-cover shadow-2xl ring-4 ring-[#0b0b0e] md:size-52" />
            ) : (
              <div className="grid size-40 place-items-center rounded-full bg-white/10 text-5xl font-black md:size-52">{artist.name[0]}</div>
            )}
            <span className="absolute -bottom-1 -end-1 grid size-12 place-items-center rounded-full bg-black shadow-xl ring-2 ring-black" title={`${t("onPlatform")} ${platform}`}>
              <BrandIcon name={artist.source} color="brand" className="size-6" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">
              {t("artist")}
              {(artist.verified || o?.officialChannelId) && <span className="flex items-center gap-1 text-cyan"><BadgeCheck className="size-4" /> {t("officialAccount")}</span>}
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 normal-case tracking-normal text-white/80"><BrandIcon name={artist.source} color="brand" className="size-3" /> {platform}{o?.handle ? ` · ${o.handle}` : ""}</span>
            </p>
            <h1 className="mt-1 truncate text-4xl font-black tracking-tight drop-shadow md:text-6xl">{artist.name}</h1>

            {/* official stats */}
            <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
              {o?.monthlyAudience && <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur"><Headphones className="size-3.5 text-[#1DB954]" /> <b>{o.monthlyAudience.split(" ")[0]}</b> {t("monthlyAudience")}</span>}
              {o?.subscribers && <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur"><Users className="size-3.5 text-rose" /> <b>{o.subscribers.split(" ")[0]}</b> {t("subscribers")}</span>}
              {o?.totalViews && <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur"><Eye className="size-3.5 text-cyan" /> <b>{o.totalViews.split(" ")[0]}</b> {t("totalViews")}</span>}
              {o?.videoCount && <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur"><Video className="size-3.5 text-white/70" /> {o.videoCount}</span>}
              {o?.country && <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur"><MapPin className="size-3.5 text-white/70" /> {o.country}</span>}
              {o?.joined && <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur"><CalendarDays className="size-3.5 text-white/70" /> {o.joined.replace("Joined ", "")}</span>}
              {!o && <span className="rounded-full bg-black/40 px-3 py-1 backdrop-blur">{formatCount(artist.monthlyListeners)} {t("monthlyListeners")}</span>}
              <span className="rounded-full bg-black/40 px-3 py-1 backdrop-blur">{artist.followers} {t("followers")} · DON MUSE</span>
            </div>
            {(o?.description ?? artist.bio) && <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-relaxed text-white/60">{o?.description ?? artist.bio}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button onClick={() => topTracks.length && playQueueNow(topTracks, 0)} disabled={!topTracks.length} className="flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105 disabled:opacity-40">
                <Play className="size-4 fill-black" /> {t("play")}
              </button>
              <button onClick={() => { if (topTracks.length) playQueueNow([...topTracks].sort(() => Math.random() - 0.5), 0); }} disabled={!topTracks.length} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/12 disabled:opacity-40">
                <Shuffle className="size-4" /> {t("shuffle")}
              </button>
              <FollowButton artistId={artist.id} initial={artist.following} />
              <button onClick={() => void shareUrl(links.artist(artist.id), artist.name).then((r) => r === "copied" && toast.success(t("copied")))} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/12"><Share2 className="size-4" /> {t("share")}</button>
              <Link href="/downloads" onClick={() => { topTracks.slice(0, 30).forEach((tr) => enqueueTrack(tr, "mp3-320")); toast(t("addBatch"), { description: `${Math.min(30, topTracks.length)} → ${t("downloads")}` }); }} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/12"><DownloadCloud className="size-4" /> {t("downloadAll")}</Link>
              {o?.officialChannelId && (
                <a href={`https://www.youtube.com/channel/${o.officialChannelId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:bg-white/10">
                  <BrandIcon name="youtubevideo" color="brand" className="size-3.5" /> {t("openOnPlatform")}
                </a>
              )}
              {(o?.links ?? []).slice(0, 4).map((l) => (
                <a key={l.url} href={l.url.startsWith("http") ? l.url : `https://${l.url}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60 hover:bg-white/10">
                  <Link2 className="size-3.5" /> {l.title}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="no-scrollbar mt-6 flex gap-1.5 overflow-x-auto border-b border-white/[0.06] pb-2">
        {visibleTabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors", tab === tb.id ? "bg-white text-black" : "text-white/55 hover:bg-white/8 hover:text-white")}>
            <tb.icon className="size-4" /> {t(tb.key)} <span className={cn("font-mono text-[10px]", tab === tb.id ? "text-black/50" : "text-white/35")}>{counts[tb.id]}</span>
          </button>
        ))}
        {loading && <Loader2 className="ms-2 size-4 animate-spin self-center text-white/40" />}
        <span className="ms-auto hidden self-center font-mono text-[10px] text-white/30 md:block">{stats.tracks} {t("songs")} · {stats.albums} {t("tabAlbums").toLowerCase()}</span>
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
        {tab === "top" && (
          <>
            {Object.keys(topPlays).length > 0 && (
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {topTracks.slice(0, 5).map((tr, i) => (
                  <button key={tr.id} onClick={() => playQueueNow(topTracks, i)} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 text-start ring-1 ring-white/[0.06] hover:bg-white/[0.08]">
                    <span className="font-mono text-lg font-black text-white/25">{i + 1}</span>
                    {tr.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tr.coverUrl} alt="" className="size-12 rounded-lg object-cover" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold">{tr.title}</span>
                      <span className="block truncate font-mono text-[11px] text-[#1DB954]">{topPlays[tr.id] ?? ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <TrackList tracks={topTracks} showAlbum />
          </>
        )}
        {(tab === "albums" || tab === "singles") && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {(tab === "albums" ? albums : singles).map((a) => <AlbumCard key={a.id} album={a} />)}
          </div>
        )}
        {tab === "collabs" && <TrackList tracks={collaborations} showAlbum emptyText="—" />}
        {tab === "videos" && <VideoGrid items={videos} />}
        {tab === "live" && <VideoGrid items={live} />}
        {tab === "related" && (
          <div className="flex flex-wrap gap-3">
            {related.map((a) => (
              <div key={a.id} className="relative">
                <ArtistCard artist={a} />
                {a.monthly && <span className="pointer-events-none absolute inset-x-0 bottom-12 text-center font-mono text-[10px] text-[#1DB954]">{a.monthly.split(" ")[0]} {t("monthlyAudience")}</span>}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <p className="mt-6 flex items-center gap-2 px-1 text-[11px] text-white/35">
        <BadgeCheck className="size-3.5" /> {t("officialNote")}
        {data.featuredOn.length > 0 && <span className="ms-auto flex items-center gap-1.5">{data.featuredOn.slice(0, 3).map((f) => <Link key={f.id} href={`/search?q=${encodeURIComponent(f.title)}`} className="rounded-full border border-white/10 px-2 py-0.5 hover:bg-white/8">{f.title}</Link>)}</span>}
      </p>
    </div>
  );
}
