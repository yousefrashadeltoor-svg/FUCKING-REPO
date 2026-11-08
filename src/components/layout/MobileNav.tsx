"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Search, HardDrive, BookOpen, Tv, Library, Radio, UserCheck,
  Clapperboard, Inbox, BarChart3, Sparkles, Video, Activity, Settings, UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const ITEMS = [
  { href: "/", key: "home" as const, icon: Home },
  { href: "/search", key: "search" as const, icon: Search },
  { href: "/my-music", key: "myMusic" as const, icon: HardDrive },
  { href: "/library", key: "library" as const, icon: Library },
  { href: "/following", key: "followingTab" as const, icon: UserCheck },
  { href: "/radio", key: "radio" as const, icon: Radio },
  { href: "/tv", key: "tv" as const, icon: Tv },
  { href: "/quran", key: "quran" as const, icon: BookOpen },
  { href: "/reels", key: "reels" as const, icon: Clapperboard },
  { href: "/downloads", key: "downloads" as const, icon: Inbox },
  { href: "/stats", key: "statsTitle" as const, icon: BarChart3 },
  { href: "/ai", key: "ai" as const, icon: Sparkles },
  { href: "https://www.youtube.com", label: "YouTube", icon: Video, external: true },
  { href: "/youtube-profile", key: "ytProfile" as const, icon: UserCheck },
  { href: "/diagnostics", key: "diagnostics" as const, icon: Activity },
  { href: "/settings", key: "settings" as const, icon: Settings },
  { href: "/about", key: "developer" as const, icon: UserRound },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      aria-label="Main navigation"
      className="glass-player z-30 mx-2 mb-2 grid w-auto min-w-0 max-w-[calc(100vw-1rem)] grid-cols-9 gap-x-0.5 gap-y-0.5 rounded-2xl px-1.5 py-1.5 lg:hidden"
    >
      {ITEMS.map((it) => {
        const external = "external" in it && it.external === true;
        const active = !external && (it.href === "/" ? pathname === "/" : pathname.startsWith(it.href));
        const Icon = it.icon;
        const label = "label" in it ? it.label : t(it.key);
        const className = cn(
          "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0 py-1 text-[7.5px] font-semibold leading-none transition-colors duration-150",
          active ? "bg-white/[0.075] text-[var(--app-accent)]" : "text-[color:var(--app-muted)] hover:text-[color:var(--app-text)]",
        );
        const content = (
          <>
            <Icon className={cn("size-[15px] shrink-0", active && "drop-shadow-[0_0_7px_var(--dynamic-glow)]")} />
            <span className="max-w-full truncate">{label}</span>
          </>
        );

        return external ? (
          <a key={it.href} href={it.href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label} title={label}>
            {content}
          </a>
        ) : (
          <Link key={it.href} href={it.href} className={className} aria-label={label} title={label}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
