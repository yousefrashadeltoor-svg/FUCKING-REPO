
// Mobile bottom navigation (Android / narrow screens).
// All five destinations are real routes, with the expandable player above it.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, HardDrive, BookOpen, Tv, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const ITEMS = [
  { href: "/", key: "home" as const, icon: Home },
  { href: "/search", key: "search" as const, icon: Search },
  { href: "/my-music", key: "myMusic" as const, icon: HardDrive },
  { href: "/quran", key: "quran" as const, icon: BookOpen },
  { href: "/library", key: "library" as const, icon: Library },
  { href: "/tv", key: "tv" as const, icon: Tv },
];

export function MobileNav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="glass-player z-30 mx-2 mb-2 flex items-center justify-around rounded-2xl px-1 py-1.5 md:hidden">
      {ITEMS.map((it) => {
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[9.5px] font-bold transition-colors",
              active ? "text-[var(--app-accent)]" : "text-[color:var(--app-muted)]",
            )}
          >
            <Icon className={cn("size-5", active && "drop-shadow-[0_0_8px_var(--dynamic-glow)]")} />
            <span className="truncate">{t(it.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
