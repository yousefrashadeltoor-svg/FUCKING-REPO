import { localFetch } from "@/lib/local/client";

// Save / unsave an album (persisted via /api/albums/like).
import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function AlbumLikeButton({ albumId, initial, compact = false }: { albumId: number; initial: boolean; compact?: boolean }) {
  const t = useT();
  const [liked, setLiked] = useState(initial);
  const toggle = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const next = !liked;
    setLiked(next);
    try {
      const res = await localFetch("/api/albums/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId }) });
      const d = (await res.json()) as { liked?: boolean };
      if (typeof d.liked === "boolean") {
        setLiked(d.liked);
        toast(d.liked ? t("savedAlbum") : t("removedFromLikes"), { icon: <Heart className={cn("size-4", d.liked && "fill-rose text-rose")} /> });
      }
    } catch {
      setLiked(!next);
    }
  };
  if (compact) {
    return (
      <button onClick={(e) => void toggle(e)} className={cn("grid size-8 place-items-center rounded-full bg-black/60 backdrop-blur transition-colors hover:bg-black/80", liked ? "text-rose" : "text-white/70")} aria-label={t("saveAlbum")}>
        <Heart className={cn("size-4", liked && "fill-rose")} />
      </button>
    );
  }
  return (
    <button onClick={(e) => void toggle(e)} className={cn("flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors", liked ? "border-rose/50 bg-rose/15 text-rose" : "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/12")}>
      <Heart className={cn("size-4", liked && "fill-rose")} /> {liked ? t("savedAlbum") : t("saveAlbum")}
    </button>
  );
}
