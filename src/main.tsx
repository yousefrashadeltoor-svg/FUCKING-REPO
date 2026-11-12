import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Providers } from "@/components/providers";
import AppLayout from "@/app/(app)/layout";
import "@/app/globals.css";

const Home=lazy(()=>import("@/app/(app)/page"));
const Search=lazy(()=>import("@/app/(app)/search/page"));
const MyMusic=lazy(()=>import("@/app/(app)/my-music/page"));
const Library=lazy(()=>import("@/app/(app)/library/page"));
const Following=lazy(()=>import("@/app/(app)/following/page"));
const Radio=lazy(()=>import("@/app/(app)/radio/page"));
const Tv=lazy(()=>import("@/app/(app)/tv/page"));
const Quran=lazy(()=>import("@/app/(app)/quran/page"));
const Reels=lazy(()=>import("@/app/(app)/reels/page"));
const AI=lazy(()=>import("@/app/(app)/ai/page"));
const Downloads=lazy(()=>import("@/app/(app)/downloads/page"));
const Settings=lazy(()=>import("@/app/(app)/settings/page"));
const About=lazy(()=>import("@/app/(app)/about/page"));
const Diagnostics=lazy(()=>import("@/app/(app)/diagnostics/page"));
const YouTube=lazy(()=>import("@/app/(app)/youtube-profile/page"));
const Track=lazy(()=>import("@/app/(app)/track/[id]/page"));
const Artist=lazy(()=>import("@/app/(app)/artists/[id]/page"));
const Album=lazy(()=>import("@/app/(app)/albums/[id]/page"));
const Playlist=lazy(()=>import("@/app/(app)/playlists/[id]/page"));
const Alarms=lazy(()=>import("@/app/(app)/alarms/page"));

class ErrorBoundary extends Component<{children:ReactNode},{error:Error|null}> {
  state:{error:Error|null}={error:null};
  static getDerivedStateFromError(error:Error){return {error};}
  componentDidCatch(error:Error,info:ErrorInfo){console.error("DON MUSE UI",error,info.componentStack);}
  render(){if(this.state.error)return <div dir="rtl" className="grid min-h-dvh place-content-center gap-4 bg-[#05060a] p-8 text-center text-white"><h1 className="text-2xl font-bold">تعذّر فتح هذه الصفحة</h1><p className="max-w-lg text-sm text-white/60">{this.state.error.message}</p><button className="rounded-full bg-emerald-500 px-6 py-3 font-bold text-black" onClick={()=>window.location.assign(import.meta.env.BASE_URL)}>العودة إلى DON MUSE</button></div>;return this.props.children;}
}
const loading=<div className="grid min-h-64 place-items-center"><span className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-[var(--app-accent)]" aria-label="جارٍ التحميل" /></div>;
// Vite uses relative assets (base "./") in the APK, but the router needs an
// absolute basename. WebViewAssetLoader serves every SPA route under /assets/www/.
const routerBase = window.__DM_NATIVE_TOKEN__ && window.DonMuseNative
  ? "/assets/www"
  : import.meta.env.BASE_URL === "./" ? "/" : import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary><BrowserRouter basename={routerBase}><Providers><Routes><Route element={<AppLayout/>}>
    <Route index element={<Suspense fallback={loading}><Home/></Suspense>}/>
    {([["search",Search],["my-music",MyMusic],["library",Library],["following",Following],["radio",Radio],["tv",Tv],["quran",Quran],["reels",Reels],["ai",AI],["downloads",Downloads],["settings",Settings],["about",About],["diagnostics",Diagnostics],["youtube-profile",YouTube],["alarms",Alarms]] as const).map(([path,Page])=><Route key={path} path={path} element={<Suspense fallback={loading}><Page/></Suspense>}/>)}
    <Route path="track/:id" element={<Suspense fallback={loading}><Track/></Suspense>}/>
    <Route path="artists/:id" element={<Suspense fallback={loading}><Artist/></Suspense>}/>
    <Route path="albums/:id" element={<Suspense fallback={loading}><Album/></Suspense>}/>
    <Route path="playlists/:id" element={<Suspense fallback={loading}><Playlist/></Suspense>}/>
    <Route path="*" element={<div className="p-10 text-center" dir="rtl">الصفحة غير موجودة. استخدم القائمة للعودة.</div>}/>
  </Route></Routes></Providers></BrowserRouter></ErrorBoundary>
);
