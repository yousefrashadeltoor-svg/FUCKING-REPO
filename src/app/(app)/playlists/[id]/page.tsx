import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PlaylistHeader } from "@/components/playlists/PlaylistHeader";
import { TrackList } from "@/components/tracks/TrackList";
import { localFetch } from "@/lib/local/client";
import type { PlaylistDetailDTO } from "@/lib/types";
export default function Page(){const {id}=useParams<{id:string}>();const [data,setData]=useState<PlaylistDetailDTO|null>(null);const load=useCallback(()=>{void localFetch(`/api/playlists/${id}`).then(async r=>{if(r.ok)setData(await r.json() as PlaylistDetailDTO);});},[id]);useEffect(()=>{load();window.addEventListener("donmuse:refresh",load);return()=>window.removeEventListener("donmuse:refresh",load);},[load]);return data?<div className="p-4 md:p-6"><PlaylistHeader playlist={data}/><div className="mt-6"><TrackList tracks={data.tracks}/></div></div>:<p className="p-8 text-center text-white/50">القائمة غير موجودة.</p>;}
