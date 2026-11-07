import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RightPanel } from "@/components/layout/RightPanel";
import { GlobalAmbient } from "@/components/layout/GlobalAmbient";
import { MasterPlaybar } from "@/components/player/MasterPlaybar";
import { AccentInit } from "@/components/layout/AccentInit";
import { DensityInit } from "@/components/layout/DensityInit";
import { OfflineInit } from "@/components/layout/OfflineInit";
import { PlayerOverlays } from "@/components/player/PlayerOverlays";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <GlobalAmbient />
      <AccentInit />
      <DensityInit />
      <OfflineInit />
      <PlayerOverlays />
      <div className="relative z-10 flex min-h-0 flex-1 gap-3 p-3 pt-2">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TopBar />
          <main className="glass-panel aura-scroll relative min-h-0 flex-1 overflow-y-auto rounded-2xl [&>div.h-full]:h-full">
            {children}
          </main>
        </div>
        <RightPanel />
      </div>
      <div className="relative z-10 px-3 pb-3">
        <MasterPlaybar />
      </div>
    </div>
  );
}
