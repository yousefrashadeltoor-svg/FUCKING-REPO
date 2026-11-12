import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RightPanel } from "@/components/layout/RightPanel";
import { GlobalAmbient } from "@/components/layout/GlobalAmbient";
import { MasterPlaybar } from "@/components/player/MasterPlaybar";
import { PlayerOverlays } from "@/components/player/PlayerOverlays";
import { MobileNav } from "@/components/layout/MobileNav";
import { PageTransition } from "@/components/layout/PageTransition";
import { AudioHost } from "@/components/player/AudioHost";

export default function AppLayout() {
  return <div className="relative flex h-dvh flex-col overflow-hidden">
    <GlobalAmbient/><PlayerOverlays/><AudioHost/>
    <div className="relative z-10 flex min-h-0 flex-1 gap-3 p-2 sm:p-3 sm:pt-2">
      <Sidebar/>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
        <TopBar/>
        <main id="main-content" className="glass-panel aura-scroll relative min-h-0 flex-1 overflow-y-auto rounded-2xl [&>div.h-full]:h-full"><PageTransition><Outlet/></PageTransition></main>
      </div>
      <RightPanel/>
    </div>
    <div className="relative z-10 px-2 pb-2 sm:px-3 sm:pb-3"><MasterPlaybar/></div>
    <MobileNav/>
  </div>;
}
