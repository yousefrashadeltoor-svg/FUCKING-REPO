import { useEffect } from "react";
import { isNativeHost, nativePlayback, refreshWidgets } from "@/lib/platform/native";
import { usePlayerStore } from "@/stores/player-store";
import { useSettingsStore } from "@/stores/settings-store";

/** Permissions are requested from an explicit user action, never at cold start. */
export function NativeBridgeInit(){
  useEffect(()=>{
    if(!isNativeHost())return;
    nativePlayback.refresh();
    const s=usePlayerStore.getState();
    // The receiver is installed now; release events queued during cold start.
    window.DonMuseNative?.nativeReady?.(window.__DM_NATIVE_TOKEN__!);
    nativePlayback.setVolume(s.muted?0:s.volume);nativePlayback.setRate(s.playbackRate);
    nativePlayback.setRepeat(s.repeat);nativePlayback.setShuffle(s.shuffle);nativePlayback.setEq(s.eqBands);
    const off=usePlayerStore.subscribe((state,prev)=>{
      if(state.currentTrack?.id!==prev.currentTrack?.id)refreshWidgets();
      if(state.volume!==prev.volume||state.muted!==prev.muted)nativePlayback.setVolume(state.muted?0:state.volume);
      if(state.playbackRate!==prev.playbackRate)nativePlayback.setRate(state.playbackRate);
    });
    let background=useSettingsStore.getState().backgroundPlayback;
    const offSettings=useSettingsStore.subscribe(st=>{if(background&&!st.backgroundPlayback)nativePlayback.stop();background=st.backgroundPlayback;});
    const resume=()=>{if(document.visibilityState==="visible")nativePlayback.refresh();};
    document.addEventListener("visibilitychange",resume);
    return()=>{off();offSettings();document.removeEventListener("visibilitychange",resume);};
  },[]);
  return null;
}
