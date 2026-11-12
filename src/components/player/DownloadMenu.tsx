import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Film, Music4, Loader2, X, AlertTriangle, Check, Scissors, Link2, Share2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { links, shareTrack, shareUrl } from "@/lib/share";
import { isNativeHost, resolveTrackFormats, type FormatsResult } from "@/lib/platform/native";
import { useDownloadStore } from "@/stores/download-store";
import { sanitizeFilename, sourceFromUrl } from "@/lib/local/model";
import { networkMessage } from "@/lib/local/online";
import type { DownloadFormatDTO, TrackDTO } from "@/lib/types";

type Tab="formats"|"clip"|"page";
const size=(n:number)=>!n?"الحجم غير معلن":n>=1e9?`${(n/1e9).toFixed(2)} GB`:n>=1e6?`${(n/1e6).toFixed(1)} MB`:`${Math.round(n/1e3)} KB`;
export function sourcePageUrl(track:TrackDTO):string|null{
  if(track.source==="youtube"&&track.sourceId)return `https://www.youtube.com/watch?v=${encodeURIComponent(track.sourceId)}`;
  if(track.sourceId&&/^https?:\/\//.test(track.sourceId))return track.sourceId;
  if(/^https?:\/\//.test(track.streamUrl))return track.streamUrl;
  return null;
}
export function browserFormats(track:TrackDTO):FormatsResult{
  const url=sourcePageUrl(track)??track.streamUrl;const direct=/^https?:\/\//.test(url)&&!sourceFromUrl(url)?.match(/youtube|soundcloud|bandcamp/);
  const ext=direct?(new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]??track.mimeType?.split("/")[1]??"mp3"):"mp3";
  return {source:track.source,sourceUrl:url,title:track.title,durationSec:track.durationSec,coverUrl:track.coverUrl,extractor:"direct",note:"في المتصفح يتاح الملف الأصلي فقط إذا سمح المصدر بـ CORS. التحويل وقص المقاطع وحل روابط المنصات متاحة في APK.",audio:direct?[{id:"original",kind:"audio",label:"الملف الأصلي",ext,mime:track.mimeType??"audio/mpeg",quality:"original",bitrateKbps:track.bitrate,sizeBytes:track.sizeBytes??0,estimated:!track.sizeBytes,lossless:track.lossless,cover:false,codec:track.codec,url}]:[],video:[]};
}

export function DownloadMenu({track,onClose,initialTab="formats",onEvent}:{track:TrackDTO;onClose:()=>void;initialTab?:Tab;onEvent?:(kind:string)=>void}){
  const t=useT();const [tab,setTab]=useState<Tab>(initialTab);const [data,setData]=useState<FormatsResult|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [kind,setKind]=useState<"audio"|"video">("audio");const [queued,setQueued]=useState(new Set<string>());const [retry,setRetry]=useState(0);
  useEffect(()=>{let alive=true;setLoading(true);setError(null);setData(null);
    const load=isNativeHost()?resolveTrackFormats(track):Promise.resolve(browserFormats(track));
    void load.then(d=>{if(!alive)return;setData(d);if(!d.audio.length&&d.video.length)setKind("video");}).catch(e=>{if(alive)setError(networkMessage(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
  },[track,retry]);
  const list=useMemo(()=>data?(kind==="audio"?data.audio:data.video):[],[data,kind]);
  const enqueue=(f:DownloadFormatDTO,startSec?:number,endSec?:number)=>{
    const url=isNativeHost()?(data?.sourceUrl??sourcePageUrl(track)??track.streamUrl):(f.url??data?.sourceUrl??"");
    const preset=f.id.startsWith("native:")?"original":f.id;const id=startSec!==undefined?`clip-${startSec}-${endSec}-${f.id}`:f.id;
    useDownloadStore.getState().add({title:track.title,artist:track.artistName,cover:track.coverUrl,kind:startSec!==undefined?"clip":"full",preset,formatId:f.id,url,sourceUrl:data?.sourceUrl??url,filename:sanitizeFilename(`${track.title} - ${track.artistName}${startSec!==undefined?` (${Math.round(startSec)}-${Math.round(endSec??0)}s)`:""}`,f.ext),mime:f.mime,track,startSec,endSec,headers:f.headers});
    setQueued(s=>new Set(s).add(id));onEvent?.("download");toast.success("أُضيف إلى التحميل",{description:"تابع التقدم والحفظ الفعلي في مركز التحميل"});
  };
  return <div className="glass-modal w-[460px] max-w-[94vw] rounded-2xl p-3" dir="auto" onClick={e=>e.stopPropagation()}>
    <div className="mb-3 flex items-start justify-between gap-3 px-2 pt-1"><div className="min-w-0"><h3 className="flex items-center gap-2 text-sm font-bold"><Download className="size-4 text-[var(--app-accent)]"/>{t("dlTitle")}</h3><p className="mt-1 truncate text-xs text-white/55">{track.title} — {track.artistName}</p></div><button onClick={onClose} aria-label="إغلاق" className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10"><X className="size-4"/></button></div>
    <div className="mb-3 flex gap-1 rounded-xl bg-black/40 p-1">{([["formats",Download,t("dlTabFormats")],["clip",Scissors,t("dlTabClip")],["page",Link2,t("dlTabPage")]] as const).map(([id,Icon,label])=><button key={id} onClick={()=>setTab(id)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-bold",tab===id?"bg-white text-black":"text-white/60")}><Icon className="size-3.5"/>{label}</button>)}</div>
    {tab==="formats"&&<div className="aura-scroll max-h-[65dvh] overflow-y-auto">
      {loading&&<div className="grid place-items-center gap-3 py-12 text-xs text-white/55"><Loader2 className="size-6 animate-spin text-[var(--app-accent)]"/>جارٍ فحص المصادر والصيغ الفعلية…</div>}
      {error&&<div role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><AlertTriangle className="mb-2 size-5 text-amber-300"/><p className="text-xs leading-6 text-white/75">{error}</p><button onClick={()=>setRetry(x=>x+1)} className="mt-3 flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-bold"><RefreshCw className="size-3.5"/>إعادة المحاولة</button>{sourcePageUrl(track)&&<a className="mt-3 block text-xs text-[var(--app-accent)] underline" href={sourcePageUrl(track)!} target="_blank" rel="noreferrer">فتح المصدر الأصلي</a>}</div>}
      {data&&!loading&&<>
        <div className="mb-2 flex gap-1 px-1">{(["audio","video"] as const).map(k=><button key={k} onClick={()=>setKind(k)} className={cn("flex-1 rounded-lg px-3 py-2 text-xs font-bold",kind===k?"bg-white/10 text-white":"text-white/45")}>{k==="audio"?<Music4 className="me-1 inline size-3.5"/>:<Film className="me-1 inline size-3.5"/>}{k==="audio"?"صوت":"فيديو"} ({k==="audio"?data.audio.length:data.video.length})</button>)}</div>
        <div className="flex flex-col gap-1">{list.map(f=><button key={f.id} onClick={()=>enqueue(f)} className="flex w-full items-center gap-3 rounded-xl p-3 text-start hover:bg-white/8"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--app-accent)]/10 text-[var(--app-accent)]">{queued.has(f.id)?<Check className="size-4"/>:f.kind==="video"?<Film className="size-4"/>:<Music4 className="size-4"/>}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-[13px] font-bold">{f.label}<span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase">{f.ext}</span></span><span className="mt-1 block text-[11px] text-white/50">{f.estimated?"~":""}{size(f.sizeBytes)} · {f.lossless?"Lossless":f.bitrateKbps?`${f.bitrateKbps} kbps`:f.quality}{f.cover?" · غلاف مضمّن":""}</span></span><Download className="size-4 shrink-0 text-white/65"/></button>)}</div>
        {!list.length&&!error&&<p className="px-3 py-8 text-center text-xs leading-6 text-white/55">لا توجد صيغة {kind==="audio"?"صوتية":"فيديو"} قابلة للتنزيل من هذا المصدر. قد يكون محميًا بـ DRM أو مباشرًا فقط. جرّب التبويب الآخر أو رابطًا مباشرًا.</p>}
        {data.note&&<p className="mt-3 rounded-xl bg-white/[.035] p-3 text-[11px] leading-6 text-white/55">{data.note}</p>}
      </>}
    </div>}
    {tab==="clip"&&<ClipTab track={track} data={data} onSave={enqueue}/>}
    {tab==="page"&&<PageTab track={track}/>}
  </div>;
}

function ClipTab({track,data,onSave}:{track:TrackDTO;data:FormatsResult|null;onSave:(f:DownloadFormatDTO,start:number,end:number)=>void}){
  const dur=data?.durationSec||track.durationSec||0;const [start,setStart]=useState(0);const [end,setEnd]=useState(Math.min(30,dur||30));const [fmt,setFmt]=useState("mp3-320");
  const formats=data?.audio.filter(f=>!f.id.startsWith("native:"))??[];const selected=formats.find(f=>f.id===fmt)??formats[0];const valid=dur>0&&start>=0&&end>start&&end<=dur;
  return <div className="p-2"><p className="text-xs leading-6 text-white/60">قص دقيق على الجهاز بواسطة FFmpeg داخل APK، دون خادم. الملفات المحمية بـ DRM غير مدعومة.</p><div className="mt-4 rounded-xl bg-black/30 p-4"><div className="mb-3 flex justify-between font-mono text-xs text-[var(--app-accent)]"><span>{formatTime(start)}</span><span>{formatTime(Math.max(0,end-start))}</span><span>{formatTime(end)}</span></div><label className="block text-xs text-white/60">البداية<input aria-label="بداية القص بالثواني" type="range" min={0} max={dur||1} step={.1} value={start} onChange={e=>setStart(Math.min(Number(e.target.value),end-.1))} className="aura-range mt-2 w-full" dir="ltr"/></label><label className="mt-3 block text-xs text-white/60">النهاية<input aria-label="نهاية القص بالثواني" type="range" min={0} max={dur||1} step={.1} value={end} onChange={e=>setEnd(Math.max(Number(e.target.value),start+.1))} className="aura-range mt-2 w-full" dir="ltr"/></label><div className="mt-3 grid grid-cols-2 gap-2">{[["البداية",start,setStart],["النهاية",end,setEnd]].map(([label,value,setter])=><label key={String(label)} className="text-xs text-white/55">{String(label)} (ثانية)<input type="number" min={0} max={dur} step={.1} value={Number(value)} onChange={e=>(setter as (n:number)=>void)(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"/></label>)}</div></div><div className="mt-3 flex flex-wrap gap-2">{formats.map(f=><button key={f.id} onClick={()=>setFmt(f.id)} className={cn("rounded-full border px-3 py-2 text-xs",selected?.id===f.id?"border-[var(--app-accent)] text-[var(--app-accent)]":"border-white/10 text-white/55")}>{f.label}</button>)}</div><button disabled={!isNativeHost()||!valid||!selected} onClick={()=>selected&&onSave(selected,start,end)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--app-accent)] px-5 py-3 text-sm font-bold text-black disabled:opacity-40"><Scissors className="size-4"/>حفظ المقصوص</button>{!isNativeHost()&&<p className="mt-2 text-center text-xs text-amber-200/70">القص متاح في تطبيق أندرويد.</p>}{!valid&&<p className="mt-2 text-center text-xs text-rose-300">حدد بداية ونهاية صحيحتين داخل مدة المقطع.</p>}</div>;
}
function PageTab({track}:{track:TrackDTO}){
  const t=useT();const [copied,setCopied]=useState(false);const url=links.track(track.id);const source=sourcePageUrl(track);
  return <div className="px-1"><div className="flex items-center gap-4 rounded-2xl bg-white/[.04] p-3">{track.coverUrl&&<img src={track.coverUrl} alt="" className="size-20 rounded-xl object-cover"/>}<div className="min-w-0"><p className="truncate text-sm font-bold">{track.title}</p><p className="mt-1 text-xs text-white/55">{track.artistName} · {formatTime(track.durationSec)}</p></div></div><p className="mt-4 text-xs text-white/50">رابط داخل التطبيق؛ يعمل على الجهاز الذي يحتوي الملف أو القائمة.</p><div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2"><Link2 className="size-4 shrink-0 text-[var(--app-accent)]"/><input readOnly value={url} onFocus={e=>e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-white/80 outline-none" dir="ltr"/><button aria-label={t("copyLink")} onClick={()=>void shareUrl(url,track.title).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);})} className="grid size-9 place-items-center rounded-lg bg-white/10">{copied?<Check className="size-4"/>:<Copy className="size-4"/>}</button></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={()=>void shareTrack(track)} className="flex items-center justify-center gap-2 rounded-full bg-[var(--app-accent)] px-4 py-3 text-sm font-bold text-black"><Share2 className="size-4"/>{t("share")}</button><Link href={`/track/${track.id}`} className="flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-3 text-xs font-bold"><ExternalLink className="size-4"/>{t("openPage")}</Link>{source&&<a href={source} target="_blank" rel="noreferrer" className="col-span-2 flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-3 text-xs text-white/70"><ExternalLink className="size-4"/>فتح المصدر الأصلي</a>}</div></div>;
}
