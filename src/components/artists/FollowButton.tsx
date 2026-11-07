"use client";

// Follow / unfollow an artist (optimistic, persisted via /api/artists/[id]/follow).
import { useState } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function FollowButton({ artistId, initial, size = "md", onChange }: { artistId: number; initial: boolean; size?: "sm" | "md"; onChange?: (following: boolean) => void }) {
  const t = useT();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toggle = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    onChange?.(next);
    try {
      const res = await fetch(`/api/artists/${artistId}/follow`, { method: "POST" });
      const d = (await res.json()) as { following?: boolean };
      if (typeof d.following === "boolean") {
        setFollowing(d.following);
        onChange?.(d.following);
        toast(d.following ? t("followedToast") : t("unfollowedToast"), { icon: d.following ? <UserCheck className="size-4 text-[#1DB954]" /> : <UserPlus className="size-4" /> });
      }
    } catch {
      setFollowing(!next);
      onChange?.(!next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={(e) => void toggle(e)}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full font-bold transition-all",
        size === "sm" ? "px-3 py-1 text-[11px]" : "px-4 py-2 text-sm",
        following ? "border border-[#1DB954]/60 bg-[#1DB954]/15 text-[#1DB954]" : "bg-white text-black hover:scale-105",
      )}
      aria-pressed={following}
    >
      {following ? <UserCheck className={size === "sm" ? "size-3.5" : "size-4"} /> : <UserPlus className={size === "sm" ? "size-3.5" : "size-4"} />}
      {following ? t("following") : t("follow")}
    </button>
  );
}
