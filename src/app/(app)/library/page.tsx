import { useCallback, useEffect, useState } from "react";
import { LibraryView } from "@/components/library/LibraryView";
import { localFetch } from "@/lib/local/client";
import type { AlbumDTO,ArtistDTO,PlaylistDTO,StatsDTO,TrackDTO } from "@/lib/types";
const empty:StatsDTO={totalPlays:0,totalMinutes:0,topTracks:[],topArtists:[],genreDistribution:[]};
export default function LibraryPage(){
  const [data,setData]=useState<{liked:TrackDTO[];playlists:PlaylistDTO[];recent:TrackDTO[];stats:StatsDTO;follows:ArtistDTO[];albums:AlbumDTO[]}>({liked:[],playlists:[],recent:[],stats:empty,follows:[],albums:[]});
  const load=useCallback(async()=>{const get=async <T,>(p:string,f:T):Promise<T>=>{const r=await localFetch(p);return r.ok?r.json() as Promise<T>:f;};const [liked,playlists,recent,stats,follows,albums]=await Promise.all([get("/api/likes",[] as TrackDTO[]),get("/api/playlists",[] as PlaylistDTO[]),get("/api/history",[] as TrackDTO[]),get("/api/stats",empty),get("/api/follows",[] as ArtistDTO[]),get("/api/albums",[] as AlbumDTO[])]);setData({liked,playlists,recent,stats,follows,albums});},[]);
  useEffect(()=>{void load();window.addEventListener("donmuse:refresh",load);return()=>window.removeEventListener("donmuse:refresh",load);},[load]);
  return <LibraryView {...data}/>;
}
