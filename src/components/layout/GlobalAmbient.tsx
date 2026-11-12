import { useEffect } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useColorExtract } from "@/hooks/useColorExtract";

export function GlobalAmbient(){
  const coverUrl=usePlayerStore(s=>s.currentTrack?.coverUrl);
  const wallpaper=useSettingsStore(s=>s.wallpaper);const opacity=useSettingsStore(s=>s.wallpaperOpacity);const custom=useSettingsStore(s=>s.customWallpaper);const large=useSettingsStore(s=>s.largeArtwork);
  useColorExtract(coverUrl);
  useEffect(()=>{document.documentElement.dataset.artwork=large?"large":"standard";},[large]);
  const src=wallpaper==="none"?null:wallpaper==="custom"?custom:`${import.meta.env.BASE_URL}backgrounds/${wallpaper}.jpg`;
  return <div className="ambient-bg" aria-hidden="true">{src&&<img key={src} src={src} alt="" className="app-wallpaper" style={{opacity}} onError={e=>{e.currentTarget.style.display="none";}}/>}<div className="aurora-field"/></div>;
}
