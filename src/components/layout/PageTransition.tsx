"use client";

// One-directional page transition — no more "appears from the left then jumps
// to the right". The key is the pathname, so the animation runs once per route
// change and never fights the router's own layout shift.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter min-h-full">
      {children}
    </div>
  );
}
