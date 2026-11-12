import { useEffect, useState } from "react";
import Link from "next/link";
import { HardDrive, Search, BookOpen, ArrowUpLeft } from "lucide-react";
import { HeroCarousel } from "@/components/sections/HeroCarousel";
import { HomeSections } from "@/components/sections/HomeSections";
import { useDeviceLibrary } from "@/stores/device-library-store";
import { localFetch } from "@/lib/local/client";
import { remember } from "@/lib/local/state";
import { deviceItemToTrack } from "@/lib/device-library";
import type { HomeSectionDTO, TrackDTO } from "@/lib/types";

export default function HomePage(){
  const songs=useDeviceLibrary(s=>s.songs);
  const init=useDeviceLibrary(s=>s.init);
  const [sections,setSections]=useState<HomeSectionDTO[]>([]);
  useEffect(()=>{void init();},[init]);
  useEffect(()=>{
    const load=()=>{void localFetch("/api/home").then(r=>r.json()).then((d:{sections:HomeSectionDTO[]})=>setSections(d.sections??[])).catch(()=>{});};
    load();window.addEventListener("donmuse:refresh",load);return()=>window.removeEventListener("donmuse:refresh",load);
  },[]);
  useEffect(()=>{remember(songs.slice(0,100).map(s=>deviceItemToTrack(s,s.uri)));},[songs]);
  const hero=(sections.find(s=>s.id==="hero")?.items??[]) as TrackDTO[];
  return <div className="p-4 md:p-6">
    {hero.length>0?<HeroCarousel tracks={hero}/>:<section className="local-welcome relative isolate overflow-hidden rounded-3xl border border-white/10 p-6 md:p-10">
      <img src={`${import.meta.env.BASE_URL}backgrounds/midnight-aurora.jpg`} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover"/>
      <div className="absolute inset-0 -z-10 bg-gradient-to-l from-black/85 via-black/55 to-black/15"/>
      <p className="text-xs font-bold tracking-[.25em] text-[var(--app-accent)]">DON MUSE · LOCAL FIRST</p>
      <h1 className="mt-4 max-w-xl text-3xl font-black leading-tight md:text-5xl">كل ما تحب سماعه.<br/><span className="gold-text">على جهازك، حتى بلا إنترنت.</span></h1>
      <p className="mt-4 max-w-lg text-sm leading-7 text-white/70">موسيقاك، القرآن، الراديو والتحميل في مكان واحد. لا حساب إلزامي ولا خادم للتطبيق.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/my-music" className="flex items-center gap-2 rounded-full bg-[var(--app-accent)] px-5 py-3 text-sm font-bold text-black"><HardDrive className="size-4"/>افتح موسيقاي<ArrowUpLeft className="size-4"/></Link>
        <Link href="/search" className="flex items-center gap-2 rounded-full border border-white/25 bg-black/30 px-5 py-3 text-sm font-bold text-white"><Search className="size-4"/>ابحث عن مقطع</Link>
        <Link href="/quran" className="flex items-center gap-2 rounded-full border border-white/25 bg-black/30 px-5 py-3 text-sm font-bold text-white"><BookOpen className="size-4"/>القرآن الكريم</Link>
      </div>
    </section>}
    <HomeSections sections={sections.filter(s=>s.id!=="hero")}/>
    {songs.length>0&&<HomeSections sections={[{id:"device",title:"موسيقاي · على جهازك",subtitle:`${songs.length} ملف متاح محليًا`,kind:"tracks",items:songs.slice(0,24).map(s=>deviceItemToTrack(s,s.uri))}]}/>}
  </div>;
}
