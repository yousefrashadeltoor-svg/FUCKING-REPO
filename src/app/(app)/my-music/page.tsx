
// ============================================================================
//  «موسيقاي» — the real device media library.
//  ---------------------------------------------------------------------------
//  Android : reads MediaStore directly (no upload, no copy) and plays files in
//            place with the native ExoPlayer; tag/artwork edits are written to
//            the original file through MediaStore.
//  Web     : File System Access API — handles persist, playback via blob URLs.
//  Playlists here are stored app-privately (SharedPreferences / IndexedDB).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Play,
  Pause,
  Search,
  RefreshCw,
  Music2,
  Film,
  Disc3,
  Users,
  ListMusic,
  Plus,
  Trash2,
  Pencil,
  Heart,
  Loader2,
  ShieldCheck,
  FolderOpen,
  X,
  Image as ImageIcon,
  ChevronRight,
  Shuffle,
  MoreVertical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useDeviceLibrary } from "@/stores/device-library-store";
import { usePlayerStore } from "@/stores/player-store";
import { toggleNow } from "@/lib/audio/controller";
import { isNativeHost } from "@/lib/platform/native";
import { groupByAlbum, groupByArtist, type DeviceItem } from "@/lib/device-library";

type Tab = "songs" | "artists" | "albums" | "videos" | "playlists";

const TABS: { id: Tab; key: Parameters<ReturnType<typeof useT>>[0]; icon: typeof Music2 }[] = [
  { id: "songs", key: "myMusicSongs", icon: Music2 },
  { id: "artists", key: "myMusicArtists", icon: Users },
  { id: "albums", key: "myMusicAlbums", icon: Disc3 },
  { id: "videos", key: "myMusicVideos", icon: Film },
  { id: "playlists", key: "myMusicPlaylists", icon: ListMusic },
];

function Cover({ item, size = 64, round }: { item: DeviceItem; size?: number; round?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (item.albumArtUri && !broken) {
    return (

      <img
        src={item.albumArtUri}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={cn("shrink-0 object-cover shadow-lg", round ? "rounded-full" : "rounded-xl")}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center bg-gradient-to-br from-emerald-500/25 to-cyan-500/15 text-emerald-200",
        round ? "rounded-full" : "rounded-xl",
      )}
      style={{ width: size, height: size }}
    >
      {item.isVideo ? <Film className="size-[45%]" /> : <Music2 className="size-[45%]" />}
    </div>
  );
}

function MyMusicInner() {
  const t = useT();
  const params = useSearchParams();
  const native = isNativeHost();

  const {
    songs,
    videos,
    playlists,
    stats,
    scanning,
    lastScan,
    init,
    scan,
    grant,
    hasPermission,
    addWebFiles,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    updateItem,
    toggleFavourite,
    playItems,
  } = useDeviceLibrary();

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const [tab, setTab] = useState<Tab>("songs");
  const [q, setQ] = useState("");
  const [permitted, setPermitted] = useState(true);
  const [openGroup, setOpenGroup] = useState<{ kind: "artist" | "album"; key: string; name: string } | null>(null);
  const [openPlaylist, setOpenPlaylist] = useState<string | null>(null);
  const [editing, setEditing] = useState<DeviceItem | null>(null);
  const [addingTo, setAddingTo] = useState<DeviceItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const requestedOpen = useRef<string | null>(null);

  useEffect(() => {
    void init();
    if (native) setPermitted(hasPermission());
  }, [init, native, hasPermission]);

  useEffect(() => {
    const uri=params.get("open");
    if(!uri||requestedOpen.current===uri||!songs.length)return;
    const index=songs.findIndex(x=>x.uri===uri);
    if(index>=0){requestedOpen.current=uri;void playItems(songs,index,"intent");}
  },[params,songs,playItems]);

  useEffect(() => {
    if (params.get("offline") === "1" && native && !hasPermission()) {
      toast(t("myMusicPermission"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = useMemo(() => [...songs, ...videos], [songs, videos]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = tab === "videos" ? videos : songs;
    if (!needle) return base;
    return base.filter(
      (i) =>
        i.title.toLowerCase().includes(needle) ||
        i.artist.toLowerCase().includes(needle) ||
        i.album.toLowerCase().includes(needle),
    );
  }, [q, tab, songs, videos]);

  const artists = useMemo(() => groupByArtist(songs), [songs]);
  const albums = useMemo(() => groupByAlbum(songs), [songs]);

  const currentItemId =
    currentTrack?.source === "local" && currentTrack.sourceId ? currentTrack.sourceId : null;

  const doScan = async () => {
    if (!native) {
      await addWebFiles();
      return;
    }
    if (!hasPermission()) {
      const ok = await grant(["audio", "video", "notifications"]);
      setPermitted(ok);
      if (!ok) {
        toast.error(t("myMusicPermission"));
        return;
      }
    }
    await scan();
    toast.success(t("myMusicScan"));
  };

  const playItem = (item: DeviceItem, list = filtered) => {
    if (currentItemId === item.id) {
      toggleNow();
      return;
    }
    const index = list.findIndex((i) => i.id === item.id);
    void playItems(list, index < 0 ? 0 : index);
  };

  const _selectedItems = all.filter((i) => selected.has(i.id));

  return (
    <div className="relative min-h-full p-4 md:p-6">
      {/* header */}
      <div className="relative mb-5 overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(29,185,84,0.22),transparent_55%),radial-gradient(100%_100%_at_100%_0%,rgba(0,212,255,0.14),transparent_60%)] p-5 md:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-emerald-300/90">
              {native ? "Android · MediaStore" : "File System Access"}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">موسيقاي</h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[color:var(--app-muted)]">{t("myMusicSub")}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-white/10 px-2.5 py-1">{songs.length} {t("myMusicSongs")}</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">{videos.length} {t("myMusicVideos")}</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">{artists.length} {t("myMusicArtists")}</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">{albums.length} {t("myMusicAlbums")}</span>
              {lastScan > 0 && (
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[color:var(--app-muted)]">
                  {new Date(lastScan).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (filtered.length) void playItems(filtered, 0);
              }}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 rounded-full bg-[var(--app-text)] px-5 py-2.5 text-[13px] font-bold text-[var(--app-bg)] transition-transform hover:scale-105 disabled:opacity-40"
            >
              <Play className="size-4 fill-current" /> {t("play")}
            </button>
            <button
              onClick={() => {
                const shuffled = [...filtered].sort(() => Math.random() - 0.5);
                if (shuffled.length) void playItems(shuffled, 0);
              }}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/[0.12] disabled:opacity-40"
            >
              <Shuffle className="size-4" /> {t("myMusicShuffleAll")}
            </button>
            <button
              onClick={() => void doScan()}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/[0.12]"
            >
              <RefreshCw className={cn("size-4", scanning && "animate-spin")} />
              {scanning ? t("myMusicScanning") : t("myMusicScan")}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/[0.12]"
            >
              <FolderOpen className="size-4" /> {t("myMusicOpenFiles")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              multiple
              hidden
              onChange={async () => {
                await addWebFiles();
                toast.success(t("myMusicScan"));
              }}
            />
          </div>
        </div>

        {!native && (
          <p className="relative mt-4 flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-200">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            {t("myMusicNeedsApp")}
          </p>
        )}
        {native && !permitted && (
          <div className="relative mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            <ShieldCheck className="size-4" />
            {t("myMusicPermission")}
            <button
              onClick={async () => setPermitted(await grant(["audio", "video", "notifications"]))}
              className="rounded-full bg-amber-400 px-3 py-1 text-[11.5px] font-bold text-black"
            >
              {t("myMusicGrant")}
            </button>
          </div>
        )}
      </div>

      {/* tabs + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {TABS.map((tb) => {
            const Icon = tb.icon;
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => {
                  setTab(tb.id);
                  setOpenGroup(null);
                  setOpenPlaylist(null);
                }}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                  active ? "text-[var(--app-bg)]" : "text-[color:var(--app-muted)] hover:bg-white/[0.06]",
                )}
              >
                {active && (
                  <motion.span layoutId="mymusic-tab" className="absolute inset-0 -z-10 rounded-full bg-[var(--app-text)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                )}
                <Icon className="size-4" />
                {t(tb.key)}
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--app-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("myMusicSearch")}
            className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2 pe-3 ps-9 text-[13px] outline-none focus:border-white/25"
          />
        </div>
      </div>

      {/* selection toolbar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12.5px]"
          >
            <span className="font-bold text-emerald-200">{selected.size}</span>
            <button
              onClick={() => {
                const name = window.prompt(t("myMusicCreatePlaylist"), "قائمة جديدة");
                if (!name) return;
                createPlaylist(name, [...selected]);
                setSelected(new Set());
                setTab("playlists");
              }}
              className="rounded-full bg-emerald-400 px-3 py-1 font-bold text-black"
            >
              {t("myMusicCreatePlaylist")}
            </button>
            <select
              onChange={(e) => {
                if (!e.target.value) return;
                addToPlaylist(e.target.value, [...selected]);
                setSelected(new Set());
                toast.success(t("addedToQueue"));
              }}
              defaultValue=""
              className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[12px]"
            >
              <option value="">{t("myMusicAddTo")}…</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={() => setSelected(new Set())} className="ms-auto rounded-full p-1 hover:bg-white/10">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- songs / videos ---------------- */}
      {(tab === "songs" || tab === "videos") &&
        (filtered.length === 0 ? (
          <Empty
            scanning={scanning}
            canScan={native || true}
            onScan={() => void doScan()}
            onFiles={() => fileRef.current?.click()}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
            {filtered.map((item, i) => {
              const active = currentItemId === item.id;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group flex items-center gap-3 px-2.5 py-2 transition-colors",
                    active ? "bg-emerald-500/10" : i % 2 ? "bg-white/[0.015]" : "",
                    "hover:bg-white/[0.06]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelected(next);
                    }}
                    className="size-4 shrink-0 accent-emerald-500 opacity-0 transition-opacity group-hover:opacity-100 checked:opacity-100"
                    aria-label="select"
                  />
                  <button onClick={() => playItem(item)} className="relative shrink-0" aria-label={t("play")}>
                    <Cover item={item} size={42} />
                    <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      {active && isPlaying ? <Pause className="size-4 fill-white text-white" /> : <Play className="size-4 fill-white text-white" />}
                    </span>
                  </button>
                  <button onClick={() => playItem(item)} className="min-w-0 flex-1 text-start">
                    <p className={cn("truncate text-[13.5px] font-semibold", active ? "text-emerald-300" : "text-[color:var(--app-text)]")}>
                      {item.title}
                    </p>
                    <p className="truncate text-[11.5px] text-[color:var(--app-muted)]">
                      {item.artist}
                      {item.album ? ` · ${item.album}` : ""}
                    </p>
                  </button>
                  <span className="hidden shrink-0 font-mono text-[11px] text-[color:var(--app-muted)] sm:block">
                    {item.durationMs ? formatTime(item.durationMs / 1000) : "—"}
                  </span>
                  <button
                    onClick={() => toggleFavourite(item.id)}
                    className={cn("grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10", stats[item.id]?.favourite ? "text-rose" : "text-[color:var(--app-muted)]")}
                    aria-label={t("like")}
                  >
                    <Heart className={cn("size-4", stats[item.id]?.favourite && "fill-rose")} />
                  </button>
                  <RowMenu
                    onEdit={() => setEditing(item)}
                    onAddTo={() => setAddingTo(item)}
                    onCreate={() => {
                      const name = window.prompt(t("myMusicCreatePlaylist"), item.title);
                      if (!name) return;
                      createPlaylist(name, [item.id]);
                      setTab("playlists");
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}

      {/* ---------------- artists ---------------- */}
      {tab === "artists" &&
        (openGroup ? (
          <GroupDetail
            title={openGroup.name}
            items={all.filter((i) => (i.artist || "Unknown artist") === openGroup.name)}
            onBack={() => setOpenGroup(null)}
            onPlay={(list, idx) => void playItems(list, idx)}
            currentId={currentItemId}
            isPlaying={isPlaying}
          />
        ) : artists.length === 0 ? (
          <Empty scanning={scanning} onScan={() => void doScan()} onFiles={() => fileRef.current?.click()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {artists.map((g) => (
              <motion.button
                key={g.key}
                whileHover={{ y: -4 }}
                onClick={() => setOpenGroup({ kind: "artist", key: g.key, name: g.name })}
                className="group flex flex-col items-center rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-center transition-colors hover:bg-white/[0.05]"
              >
                <Cover item={{ ...(g.items[0] as DeviceItem), albumArtUri: g.cover }} size={104} round />
                <p className="mt-3 line-clamp-1 text-[13.5px] font-bold">{g.name}</p>
                <p className="text-[11px] text-[color:var(--app-muted)]">
                  {g.items.length} {t("myMusicSongs")} · {formatTime(g.durationMs / 1000)}
                </p>
              </motion.button>
            ))}
          </div>
        ))}

      {/* ---------------- albums ---------------- */}
      {tab === "albums" &&
        (openGroup ? (
          <GroupDetail
            title={openGroup.name}
            items={all.filter((i) => (i.album || "Unknown album") === openGroup.name)}
            onBack={() => setOpenGroup(null)}
            onPlay={(list, idx) => void playItems(list, idx)}
            currentId={currentItemId}
            isPlaying={isPlaying}
          />
        ) : albums.length === 0 ? (
          <Empty scanning={scanning} onScan={() => void doScan()} onFiles={() => fileRef.current?.click()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {albums.map((g) => (
              <motion.button
                key={g.key}
                whileHover={{ y: -4 }}
                onClick={() => setOpenGroup({ kind: "album", key: g.key, name: g.name })}
                className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-start transition-colors hover:bg-white/[0.05]"
              >
                <Cover item={{ ...(g.items[0] as DeviceItem), albumArtUri: g.cover }} size={999} />
                <p className="mt-2.5 line-clamp-1 text-[13.5px] font-bold">{g.name}</p>
                <p className="line-clamp-1 text-[11px] text-[color:var(--app-muted)]">
                  {g.items[0]?.artist} · {g.items.length} {t("myMusicSongs")}
                </p>
              </motion.button>
            ))}
          </div>
        ))}

      {/* ---------------- playlists ---------------- */}
      {tab === "playlists" && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => {
                const name = window.prompt(t("myMusicCreatePlaylist"));
                if (!name) return;
                createPlaylist(name);
              }}
              className="flex items-center gap-2 rounded-full bg-[var(--app-text)] px-4 py-2 text-[12.5px] font-bold text-[var(--app-bg)]"
            >
              <Plus className="size-4" /> {t("myMusicCreatePlaylist")}
            </button>
          </div>
          {playlists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center text-[13px] text-[color:var(--app-muted)]">
              {t("playlistEmpty")}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {playlists.map((pl) => {
                const plItems = pl.trackIds
                  .map((id) => all.find((i) => i.id === id))
                  .filter((i): i is DeviceItem => !!i);
                return (
                  <div key={pl.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <div className="flex items-start gap-3">
                      <button className="shrink-0" onClick={() => (plItems.length ? void playItems(plItems, 0) : null)}>
                        {plItems[0] ? <Cover item={plItems[0]} size={56} /> : (
                          <div className="grid size-14 place-items-center rounded-xl bg-white/[0.06]">
                            <ListMusic className="size-5 text-[color:var(--app-muted)]" />
                          </div>
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-bold">{pl.name}</p>
                        <p className="text-[11px] text-[color:var(--app-muted)]">{plItems.length} {t("myMusicSongs")}</p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button
                            onClick={() => (plItems.length ? void playItems(plItems, 0) : toast(t("playlistEmpty")))}
                            className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-bold text-black"
                          >
                            {t("play")}
                          </button>
                          <button
                            onClick={() => {
                              const name = window.prompt(t("myMusicRename"), pl.name);
                              if (name) renamePlaylist(pl.id, name);
                            }}
                            className="rounded-full border border-white/15 px-2 py-1 text-[11px]"
                            aria-label={t("myMusicRename")}
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`${t("delete")} “${pl.name}”?`)) deletePlaylist(pl.id);
                            }}
                            className="rounded-full border border-rose/30 px-2 py-1 text-[11px] text-rose"
                            aria-label={t("delete")}
                          >
                            <Trash2 className="size-3" />
                          </button>
                          <button
                            onClick={() => setOpenPlaylist(openPlaylist === pl.id ? null : pl.id)}
                            className="ms-auto text-[color:var(--app-muted)]"
                            aria-label={t("more")}
                          >
                            <ChevronRight className={cn("size-4 transition-transform", openPlaylist === pl.id && "rotate-90")} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <AnimatePresence>
                      {openPlaylist === pl.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="mt-2 flex flex-col gap-1 border-t border-white/[0.07] pt-2">
                            {plItems.length === 0 && <p className="py-2 text-center text-[11.5px] text-[color:var(--app-muted)]">{t("playlistEmpty")}</p>}
                            {plItems.map((it) => (
                              <div key={it.id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/[0.05]">
                                <button onClick={() => void playItems(plItems, plItems.indexOf(it))} className="min-w-0 flex-1 truncate text-start text-[12px]">
                                  {it.title}
                                </button>
                                <button onClick={() => removeFromPlaylist(pl.id, it.id)} className="text-[color:var(--app-muted)] hover:text-rose" aria-label={t("delete")}>
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------- dialogs ---------------- */}
      <AnimatePresence>
        {editing && (
          <EditDialog
            item={editing}
            onClose={() => setEditing(null)}
            onSave={async (patch) => {
              const res = await updateItem(editing.id, patch);
              if (res.ok) toast.success(t("myMusicSavedFile"));
              else toast.warning(res.message);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addingTo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85] grid place-items-center bg-black/60 p-4 backdrop-blur"
            onClick={() => setAddingTo(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-modal w-full max-w-sm rounded-2xl p-4"
            >
              <p className="mb-3 text-sm font-bold">{t("myMusicAddTo")}</p>
              <div className="aura-scroll max-h-64 overflow-y-auto">
                {playlists.length === 0 && <p className="py-4 text-center text-[12px] text-[color:var(--app-muted)]">{t("playlistEmpty")}</p>}
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      addToPlaylist(p.id, [addingTo.id]);
                      toast.success(t("trackAdded"));
                      setAddingTo(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-[13px] hover:bg-white/10"
                  >
                    <ListMusic className="size-4" /> {p.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const name = window.prompt(t("myMusicCreatePlaylist"));
                  if (!name) return;
                  createPlaylist(name, [addingTo.id]);
                  setAddingTo(null);
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.08] py-2 text-[12.5px] font-semibold hover:bg-white/[0.14]"
              >
                <Plus className="size-4" /> {t("myMusicCreatePlaylist")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RowMenu({ onEdit, onAddTo, onCreate }: { onEdit: () => void; onAddTo: () => void; onCreate: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((v) => !v)} className="grid size-8 place-items-center rounded-full text-[color:var(--app-muted)] hover:bg-white/10" aria-label="more">
        <MoreVertical className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-modal absolute end-0 top-9 z-40 w-44 rounded-xl p-1 text-[12.5px]"
            onMouseLeave={() => setOpen(false)}
          >
            <button onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-white/10">
              <Pencil className="size-3.5" /> Edit info
            </button>
            <button onClick={() => { setOpen(false); onAddTo(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-white/10">
              <ListMusic className="size-3.5" /> Add to playlist
            </button>
            <button onClick={() => { setOpen(false); onCreate(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-white/10">
              <Plus className="size-3.5" /> New playlist
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupDetail({
  title,
  items,
  onBack,
  onPlay,
  currentId,
  isPlaying,
}: {
  title: string;
  items: DeviceItem[];
  onBack: () => void;
  onPlay: (list: DeviceItem[], index: number) => void;
  currentId: string | null;
  isPlaying: boolean;
}) {
  const t = useT();
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full bg-white/[0.08] hover:bg-white/15" aria-label={t("back")}>
          <ChevronRight className="size-4 rotate-180 rtl:rotate-0" />
        </button>
        <h2 className="text-lg font-extrabold">{title}</h2>
        <button
          onClick={() => items.length && onPlay(items, 0)}
          className="ms-auto flex items-center gap-2 rounded-full bg-[var(--app-text)] px-4 py-2 text-[12.5px] font-bold text-[var(--app-bg)]"
        >
          <Play className="size-3.5 fill-current" /> {t("play")}
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
        {items.map((item, i) => {
          const active = currentId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPlay(items, i)}
              className={cn("flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-white/[0.06]", active && "bg-emerald-500/10")}
            >
              <Cover item={item} size={38} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px] font-semibold", active && "text-emerald-300")}>{item.title}</span>
                <span className="block truncate text-[11px] text-[color:var(--app-muted)]">{item.album}</span>
              </span>
              <span className="font-mono text-[11px] text-[color:var(--app-muted)]">
                {item.durationMs ? formatTime(item.durationMs / 1000) : "—"}
              </span>
              {active && isPlaying ? <Pause className="size-4 text-emerald-300" /> : <Play className="size-4 opacity-40" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ scanning, onScan, onFiles }: { scanning: boolean; canScan?: boolean; onScan: () => void; onFiles: () => void }) {
  const t = useT();
  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-white/12 p-12 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-white/[0.05]">
        {scanning ? <Loader2 className="size-7 animate-spin text-emerald-300" /> : <Music2 className="size-7 text-[color:var(--app-muted)]" />}
      </div>
      <p className="text-[14px] font-semibold">{scanning ? t("myMusicScanning") : t("myMusicEmpty")}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button onClick={onScan} className="flex items-center gap-2 rounded-full bg-[var(--app-text)] px-4 py-2 text-[12.5px] font-bold text-[var(--app-bg)]">
          <RefreshCw className="size-4" /> {t("myMusicScan")}
        </button>
        <button onClick={onFiles} className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12.5px] font-semibold">
          <FolderOpen className="size-4" /> {t("myMusicOpenFiles")}
        </button>
      </div>
    </div>
  );
}

function EditDialog({
  item,
  onClose,
  onSave,
}: {
  item: DeviceItem;
  onClose: () => void;
  onSave: (patch: { title?: string; artist?: string; album?: string; year?: number; coverDataUrl?: string }) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(item.title);
  const [artist, setArtist] = useState(item.artist);
  const [album, setAlbum] = useState(item.album);
  const [year, setYear] = useState(String(item.year || ""));
  const [cover, setCover] = useState<string | undefined>();
  const coverInput = useRef<HTMLInputElement>(null);

  const pickCover = () =>
    new Promise<void>((resolve) => {
      const input = coverInput.current;
      if (!input) return resolve();
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve();
        const reader = new FileReader();
        reader.onload = () => {
          setCover(String(reader.result));
          resolve();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[86] grid place-items-center bg-black/65 p-4 backdrop-blur"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 14 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 14 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-modal w-full max-w-md rounded-2xl p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold">{t("myMusicEditTags")}</p>
          <button onClick={onClose} className="text-[color:var(--app-muted)] hover:text-white" aria-label={t("closeAll")}>
            <X className="size-4" />
          </button>
        </div>
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => void pickCover()} className="relative size-20 shrink-0 overflow-hidden rounded-xl">
            {cover ? (

              <img src={cover} alt="" className="size-full object-cover" />
            ) : (
              <Cover item={item} size={80} />
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity hover:opacity-100">
              <ImageIcon className="size-5 text-white" />
            </span>
          </button>
          <input ref={coverInput} type="file" accept="image/*" hidden />
          <p className="text-[11.5px] leading-relaxed text-[color:var(--app-muted)]">{t("myMusicSetArt")}</p>
        </div>
        <div className="flex flex-col gap-2.5">
          <Field label={t("title")} value={title} onChange={setTitle} />
          <Field label={t("artist")} value={artist} onChange={setArtist} />
          <Field label={t("album")} value={album} onChange={setAlbum} />
          <Field label={t("year")} value={year} onChange={setYear} inputMode="numeric" />
        </div>
        <button
          onClick={() => onSave({ title, artist, album, year: Number(year) || undefined, coverDataUrl: cover })}
          className="mt-5 w-full rounded-xl bg-[var(--app-text)] py-2.5 text-[13px] font-bold text-[var(--app-bg)]"
        >
          {t("myMusicApplyToFile")}
        </button>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] uppercase tracking-wider text-[color:var(--app-muted)]">{label}</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[13px] outline-none focus:border-white/30"
      />
    </label>
  );
}

export default function MyMusicPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[color:var(--app-muted)]">…</div>}>
      <MyMusicInner />
    </Suspense>
  );
}
