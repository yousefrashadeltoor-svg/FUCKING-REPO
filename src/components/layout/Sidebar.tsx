"use client";

// ============================================================================
//  Sidebar — premium navigation rail.
//  • clean icon-only collapsed mode that stays fully clickable (tooltips)
//  • no washed-out squares behind the icons
//  • every entry is a real route
// ============================================================================
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
  HardDrive,
  UserCheck,
  Activity,
  BarChart3,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import type { PlaylistDTO } from "@/lib/types";
import { useT, type DictKey } from "@/lib/i18n";
import { isNativeHost } from "@/lib/platform/native";
import { motion } from "framer-motion";

interface NavItem {
  href: string;
  key: DictKey;
  icon: typeof Home;
  tone: string;
}

const PRIMARY: NavItem[] = [
  { href: "/", key: "home", icon: Home, tone: "text-sky-300" },
  { href: "/search", key: "search", icon: Search, tone: "text-violet-300" },
  { href: "/my-music", key: "myMusic", icon: HardDrive, tone: "text-emerald-300" },
  { href: "/library", key: "library", icon: Library, tone: "text-amber-300" },
  { href: "/following", key: "followingTab", icon: UserCheck, tone: "text-rose-300" },
  { href: "/radio", key: "radio", icon: Radio, tone: "text-orange-300" },
  { href: "/tv", key: "tv", icon: Tv, tone: "text-cyan-300" },
  { href: "/quran", key: "quran", icon: BookOpen, tone: "text-[#d4af37]" },
  { href: "/reels", key: "reels", icon: Clapperboard, tone: "text-pink-300" },
  { href: "/downloads", key: "downloads", icon: Inbox, tone: "text-lime-300" },
  { href: "/stats", key: "statsTitle", icon: BarChart3, tone: "text-teal-300" },
  { href: "/ai", key: "ai", icon: Sparkles, tone: "text-fuchsia-300" },
];

const SECONDARY: NavItem[] = [
  { href: "/youtube-profile", key: "ytProfile", icon: UserCheck, tone: "text-red-400" },
  { href: "/diagnostics", key: "diagnostics", icon: Activity, tone: "text-teal-300" },
  { href: "/settings", key: "settings", icon: Settings, tone: "text-slate-300" },
  { href: "/about", key: "developer", icon: UserRound, tone: "text-indigo-300" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const [playlists, setPlaylists] = useState<PlaylistDTO[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!router) return;
    void fetch("/api/playlists")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PlaylistDTO[]) => Array.isArray(data) && setPlaylists(data))
      .catch(() => {});
  }, [router]);

  const createPlaylist = async () => {
    const title = window.prompt(t("newPlaylist"));
    if (!title?.trim()) return;
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: "DON MUSE" }),
    });
    if (res.ok) {
      const pl = (await res.json()) as PlaylistDTO;
      toast.success(pl.title);
      setPlaylists((p) => [pl, ...p]);
      router.push(`/playlists/${pl.id}`);
    } else {
      toast.error(t("dlFailed"));
    }
  };

  const Item = ({ item }: { item: NavItem }) => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        title={t(item.key)}
        aria-label={t(item.key)}
        className={cn(
          "group relative flex items-center rounded-xl text-[13px] font-semibold transition-colors duration-200",
          collapsed ? "h-11 w-11 justify-center" : "gap-3 px-3 py-2",
          active ? "text-white" : "text-[color:var(--app-muted)] hover:text-white",
        )}
      >
        {/* Active marker: a slim accent bar + soft glow instead of a faded box
            behind the icon (readability first, in every theme). */}
        {active && (
          <motion.span
            layoutId="nav-pill"
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="absolute inset-y-1 start-0 -z-10 w-[3px] rounded-full bg-[var(--app-accent)] shadow-[0_0_14px_var(--dynamic-glow)]"
          />
        )}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 -z-20 rounded-xl opacity-0 transition-opacity duration-200",
            "bg-[radial-gradient(80%_120%_at_0%_50%,var(--dynamic-glow),transparent_70%)]",
            active ? "opacity-100" : "group-hover:opacity-60",
          )}
        />
        <Icon className={cn("size-[19px] shrink-0 transition-transform duration-200 group-hover:scale-110", active ? item.tone : "opacity-80 group-hover:opacity-100")} />
        {!collapsed && <span className="truncate">{t(item.key)}</span>}
        {collapsed && (
          <span className="pointer-events-none absolute start-full z-50 ms-2 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[11.5px] font-medium text-white opacity-0 shadow-xl backdrop-blur transition-opacity group-hover:opacity-100">
            {t(item.key)}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "glass-panel z-20 hidden shrink-0 flex-col gap-1 rounded-2xl lg:flex",
        collapsed ? "w-[64px] items-center p-2" : "w-[212px] p-3 max-[900px]:w-[168px]",
      )}
    >
      <Link href="/" className={cn("mb-1 flex items-center gap-2.5", collapsed ? "justify-center" : "px-1 py-1.5")}>
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-white to-white/80 shadow-lg shadow-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="DON MUSE" className="size-7" onError={(e) => ((e.currentTarget.style.display = "none"))} />
        </span>
        {!collapsed && (
          <span className="leading-none">
            <span className="block text-[15px] font-black tracking-tight">DON MUSE</span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.24em] text-[color:var(--app-muted)]">
              Music · Radio · TV
            </span>
          </span>
        )}
      </Link>

      <nav className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
        {PRIMARY.map((item) => (
          <Item key={item.href} item={item} />
        ))}
      </nav>

      <div className="my-2 h-px w-full bg-white/[0.07]" />

      <nav className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
        {(moreOpen || collapsed ? SECONDARY : SECONDARY.slice(0, 2)).map((item) => (
          <Item key={item.href} item={item} />
        ))}
        {!collapsed && SECONDARY.length > 2 && (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold text-[color:var(--app-muted)] transition-colors hover:text-white"
          >
            <MoreHorizontal className="size-[19px]" />
            {moreOpen ? t("closeAll") : "…"}
          </button>
        )}
      </nav>

      {/* library */}
      <div className={cn("mt-2 flex items-center", collapsed ? "justify-center" : "justify-between px-2")}>
        {!collapsed && (
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--app-muted)]">
            {t("yourLibrary")}
          </span>
        )}
        <button
          onClick={createPlaylist}
          title={t("newPlaylist")}
          aria-label={t("newPlaylist")}
          className="grid size-7 place-items-center rounded-lg text-[color:var(--app-muted)] transition-colors hover:bg-white/10 hover:text-white"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className={cn("aura-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pt-1", collapsed && "items-center")}>
        <Item item={{ href: "/library", key: "likedTracks", icon: Heart, tone: "text-rose" }} />
        {playlists.slice(0, 12).map((pl) => (
          <Link
            key={pl.id}
            href={`/playlists/${pl.id}`}
            title={pl.title}
            className={cn(
              "flex items-center rounded-xl text-[12.5px] font-medium text-[color:var(--app-muted)] transition-colors hover:bg-white/[0.05] hover:text-white",
              collapsed ? "size-11 justify-center" : "gap-2.5 px-3 py-1.5",
            )}
          >
            {pl.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pl.coverUrl} alt="" className="size-6 shrink-0 rounded-md object-cover" />
            ) : (
              <ListMusic className="size-4 shrink-0" />
            )}
            {!collapsed && <span className="truncate">{pl.title}</span>}
          </Link>
        ))}
      </div>

      {isNativeHost() && !collapsed && (
        <span className="mt-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase tracking-widest text-emerald-300">
          Android · native
        </span>
      )}

      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={t("collapse")}
        className="mt-1 grid h-8 place-items-center rounded-lg text-[color:var(--app-muted)] transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4 rtl:rotate-180" />}
      </button>
    </aside>
  );
}
