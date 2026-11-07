"use client";

// Left sidebar: brand, primary nav, library (playlists), and create-playlist.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  Search,
  Library,
  Radio,
  Inbox,
  Sparkles,
  Settings,
  Tv,
  UserRound,
  Clapperboard,
  BookOpen,
  Plus,
  ListMusic,
  Heart,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import type { PlaylistDTO } from "@/lib/types";
import { useT, type DictKey } from "@/lib/i18n";

const NAV: { href: string; key: DictKey; icon: typeof Home }[] = [
  { href: "/", key: "home", icon: Home },
  { href: "/search", key: "search", icon: Search },
  { href: "/library", key: "library", icon: Library },
  { href: "/radio", key: "radio", icon: Radio },
  { href: "/downloads", key: "downloads", icon: Inbox },
  { href: "/tv", key: "tv", icon: Tv },
  { href: "/reels", key: "reels", icon: Clapperboard },
  { href: "/quran", key: "quran", icon: BookOpen },
  { href: "/ai", key: "ai", icon: Sparkles },
  { href: "/settings", key: "settings", icon: Settings },
  { href: "/about", key: "developer", icon: UserRound },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const [playlists, setPlaylists] = useState<PlaylistDTO[]>([]);

  useEffect(() => {
    void fetch("/api/playlists")
      .then((r) => r.json())
      .then((data: PlaylistDTO[]) => setPlaylists(data))
      .catch(() => {});
  }, []);

  const createPlaylist = async () => {
    const title = window.prompt("New playlist name:");
    if (!title?.trim()) return;
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: "Created in DON MUSE." }),
    });
    if (res.ok) {
      const pl = (await res.json()) as PlaylistDTO;
      toast.success(`Playlist “${pl.title}” created`);
      setPlaylists((p) => [pl, ...p]);
      router.push(`/playlists/${pl.id}`);
    } else {
      toast.error("Could not create playlist");
    }
  };

  return (
    <aside
      className={cn(
        "glass-panel z-20 flex shrink-0 flex-col gap-2 rounded-2xl transition-all duration-300",
        collapsed ? "w-[60px] items-center p-2.5" : "w-[196px] p-3",
      )}
    >
      {/* Brand */}
      <Link href="/" className={cn("flex items-center gap-2.5 px-1 py-1.5", collapsed && "justify-center px-0")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DON MUSE" className="size-9 shrink-0 rounded-xl bg-white shadow-lg shadow-black/40" />
        {!collapsed && (
          <span className="leading-none">
            <span className="block text-[15px] font-black tracking-tight">DON MUSE</span>
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.22em] text-white/40">
              Music · Radio · TV
            </span>
          </span>
        )}
      </Link>

      {/* Primary nav */}
      <nav className="mt-2 flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const label = t(item.key);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={label}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-white/10 text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Library section */}
      {!collapsed && (
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/35">
            {t("yourLibrary")}
          </span>
          <button
            onClick={createPlaylist}
            className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            title="New playlist"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
      {collapsed && (
        <button
          onClick={createPlaylist}
          className="mx-auto mt-4 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          title="New playlist"
        >
          <Plus className="size-4" />
        </button>
      )}

      <div className="aura-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <Link
          href="/library"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white",
            collapsed && "justify-center px-0",
            pathname.startsWith("/library") && "bg-white/10 text-white",
          )}
        >
          <Heart className="size-4 shrink-0 text-rose" />
          {!collapsed && t("likedTracks")}
        </Link>
        {playlists.map((pl) => (
          <Link
            key={pl.id}
            href={`/playlists/${pl.id}`}
            title={pl.title}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white",
              collapsed && "justify-center px-0",
              pathname === `/playlists/${pl.id}` && "bg-white/10 text-white",
            )}
          >
            {pl.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pl.coverUrl} alt="" className="size-6 shrink-0 rounded-md object-cover" />
            ) : (
              <ListMusic className="size-4 shrink-0" />
            )}
            {!collapsed && (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">{pl.title}</span>
                <span className="text-[10px] text-white/30">{pl.trackCount}</span>
              </span>
            )}
          </Link>
        ))}
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mt-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] text-white/30 transition-colors hover:bg-white/5 hover:text-white/70"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        {!collapsed && t("collapse")}
      </button>
    </aside>
  );
}
