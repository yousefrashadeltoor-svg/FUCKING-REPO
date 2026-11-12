import { localFetch } from "@/lib/local/client";

// ============================================================================
//  AURA Intelligence — natural-language playlist generator + AI radio host.
//  POSTs the prompt to /api/ai/generate, which composes a playlist from audio
//  features (genre / BPM / energy / valence / year) and returns an editorial
//  description. Suggestion chips make it one-tap.
// ============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Wand2, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import type { PlaylistDetailDTO } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/stores/settings-store";
import { platformStorage } from "@/lib/storage";
import { hydrateLocal, localSnapshot } from "@/lib/local/state";

const SUGGESTIONS = [
  "dark techno from 2024, high BPM",
  "chill lofi for late night coding",
  "upbeat house for a sunny party",
  "ambient music to fall asleep to",
  "energetic synthwave for a night drive",
  "melancholic dream-pop, sad but beautiful",
  "jazz fusion for a rainy Sunday",
  "hard workout techno, 140+ BPM",
];

export default function AIPage() {
  const t = useT();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ playlist: PlaylistDetailDTO; explanation: string; matchedCount: number } | null>(null);
  const [hostLine, setHostLine] = useState("اقتراحات من مكتبتك على الجهاز. أضف مفتاح AI اختياريًا من الإعدادات للحصول على توصيات مولّدة.");

  const generate = async (p: string) => {
    if (!p.trim() || loading) return; setLoading(true); setResult(null);
    try {
      await hydrateLocal(); const all=Object.values(localSnapshot().tracks);
      if(!all.length){toast.error("أضف ملفات إلى موسيقاي أو ابحث عن مقاطع أولًا؛ لن نخترع قائمة غير موجودة.");return;}
      const key=await platformStorage.getItem("donmuse.ai.key");
      let ids:number[]=[];let title="اقتراح من مكتبتك";let explanation="ترتيب محلي حسب كلمات طلبك. لم يُستخدم اتصال أو نموذج AI.";
      const words=p.toLowerCase().split(/\s+/).filter(Boolean);
      const ranked=all.map(t=>({t,score:words.reduce((n,w)=>n+(`${t.title} ${t.artistName} ${t.genre}`.toLowerCase().includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score);
      ids=ranked.filter(x=>x.score>0).map(x=>x.t.id).slice(0,25);if(!ids.length)ids=all.slice(0,20).map(t=>t.id);
      if(key){
        const settings=useSettingsStore.getState();const endpoint=new URL(settings.aiEndpoint);if(endpoint.protocol!=="https:")throw new Error("استخدم رابط HTTPS لمزود AI");
        setHostLine("جارٍ إرسال طلبك مباشرة إلى مزود AI الذي اخترته…");
        const res=await fetch(endpoint.href,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(60_000),body:JSON.stringify({model:settings.aiModel,messages:[{role:"system",content:"You are a music playlist assistant. Choose only IDs from the supplied library. Return JSON only: {title,explanation,trackIds:number[]}. Explain in the user's language."},{role:"user",content:JSON.stringify({request:p,library:all.slice(0,200).map(t=>({id:t.id,title:t.title,artist:t.artistName,genre:t.genre}))})}],temperature:.5})});
        if(!res.ok)throw new Error(`مزود AI رفض الطلب (${res.status}); تحقق من المفتاح والرصيد والموديل`);
        const data=await res.json() as {choices?:{message:{content:string}}[]};const text=data.choices?.[0]?.message?.content??"";const parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,"")) as {title?:string;explanation?:string;trackIds?:number[]};
        const valid=new Set(all.map(t=>t.id));ids=(parsed.trackIds??[]).filter(id=>valid.has(id));title=parsed.title||title;explanation=parsed.explanation||"اقتراح مولّد من مكتبتك.";setHostLine(explanation);
      }
      const tracks=ids.map(id=>all.find(t=>t.id===id)!).filter(Boolean);if(!tracks.length)throw new Error("لم يطابق النموذج أي مقطع موجود في مكتبتك");
      const created=await localFetch("/api/playlists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,description:explanation})});const playlist=await created.json() as PlaylistDetailDTO;
      await localFetch(`/api/playlists/${playlist.id}/tracks`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trackIds:ids})});
      setResult({playlist:{...playlist,tracks,trackCount:tracks.length},explanation,matchedCount:tracks.length});toast.success(`تم حفظ “${title}” · ${tracks.length} مقطع`);
    }catch(e){toast.error((e as Error).message||"تعذّر إنشاء القائمة");}finally{setLoading(false);}
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[#667EEA] to-[#764BA2] shadow-xl shadow-violet/30">
            <Sparkles className="size-7 text-white" />
          </span>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{t("aiTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/45">{t("aiSub")}</p>
        </div>

        {/* AI radio host ticker */}
        <div className="glass-panel mt-6 flex items-center gap-3 rounded-2xl p-4">
          <Radio className="size-5 shrink-0 animate-pulse text-[#00D4FF]" />
          <p className="text-[13px] italic text-white/60">{hostLine}</p>
        </div>

        {/* prompt box */}
        <div className="glass-modal mt-4 rounded-2xl p-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate(prompt);
            }}
            rows={3}
            placeholder={t("aiPlaceholder")}
            className="w-full resize-none rounded-xl bg-transparent p-3 text-[15px] leading-relaxed text-white placeholder:text-white/30 outline-none"
          />
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="font-mono text-[10px] text-white/30">{t("aiShortcut")}</span>
            <button
              onClick={() => void generate(prompt)}
              disabled={loading || !prompt.trim()}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#667EEA] to-[#FA2D55] px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-40"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {loading ? t("aiComposing") : t("aiGenerate")}
            </button>
          </div>
        </div>

        {/* suggestions */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setPrompt(s);
                void generate(s);
              }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-[#667EEA]/50 hover:bg-[#667EEA]/15 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>

        {/* result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-panel mt-8 rounded-2xl p-5"
            >
              <div className="flex items-center gap-4">
                {result.playlist.coverUrl && (

                  <img src={result.playlist.coverUrl} alt="" className="size-20 rounded-xl object-cover shadow-lg" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00D4FF]">{t("aiComposed")}</p>
                  <h2 className="truncate text-xl font-extrabold">{result.playlist.title}</h2>
                  <p className="mt-1 line-clamp-2 text-[13px] text-white/50">{result.explanation}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2.5">
                <button
                  onClick={() => router.push(`/playlists/${result.playlist.id}`)}
                  className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105"
                >
                  {t("aiOpen")} ({result.matchedCount})
                </button>
              </div>
              <ol className="aura-scroll mt-4 max-h-64 space-y-1 overflow-y-auto pr-2">
                {result.playlist.tracks.slice(0, 10).map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-white/5">
                    <span className="w-5 text-right font-mono text-[11px] text-white/30">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-white/85">{t.title}</span>
                    <span className="truncate text-xs text-white/40">{t.artistName}</span>
                    <span className="font-mono text-[10px] text-white/30">{t.genre || "محلي"}</span>
                  </li>
                ))}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
