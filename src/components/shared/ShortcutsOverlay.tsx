"use client";

// Keyboard shortcuts reference (? key or the ⓘ in the playbar).
import { X, Keyboard } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/stores/settings-store";

const SHORTCUTS: { k: string; d: string; dAr: string }[] = [
  { k: "Space", d: "Play / Pause", dAr: "تشغيل / إيقاف" },
  { k: "←  →", d: "Seek −5s / +5s", dAr: "تقديم / إرجاع 5 ثوانٍ" },
  { k: "Shift ← →", d: "Previous / Next track", dAr: "الأغنية السابقة / التالية" },
  { k: "↑  ↓", d: "Volume up / down", dAr: "رفع / خفض الصوت" },
  { k: "M", d: "Mute / Unmute", dAr: "كتم / إلغاء الكتم" },
  { k: "L", d: "Like current track", dAr: "إعجاب بالأغنية الحالية" },
  { k: "S", d: "Toggle shuffle", dAr: "تشغيل عشوائي" },
  { k: "R", d: "Cycle repeat", dAr: "تبديل التكرار" },
  { k: "?", d: "Show / hide shortcuts", dAr: "إظهار / إخفاء الاختصارات" },
];

export function ShortcutsOverlay() {
  const t = useT();
  const open = useUIStore((s) => s.shortcutsOpen);
  const lang = useSettingsStore((s) => s.language);
  const setOpen = useUIStore((s) => s.setShortcuts);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="glass-modal w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-black"><Keyboard className="size-5 text-[#1DB954]" /> {t("shortcutsTitle")}</h3>
          <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white" aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="flex flex-col gap-2.5">
          {SHORTCUTS.map((s) => (
            <div key={s.k} className="flex items-center justify-between gap-4">
              <span className="text-sm text-white/70">{lang === "ar" ? s.dAr : s.d}</span>
              <kbd className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-xs font-bold text-white/80">{s.k}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
