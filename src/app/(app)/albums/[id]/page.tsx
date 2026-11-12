import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlbumHeader } from "@/components/albums/AlbumHeader";
import { TrackList } from "@/components/tracks/TrackList";
import { localFetch } from "@/lib/local/client";
import type { AlbumDTO,ArtistDTO,TrackDTO } from "@/lib/types";
export default function Page(){const {id}=useParams<{id:string}>();const [data,setData]=useState<{album:AlbumDTO;artist:ArtistDTO|null;tracks:TrackDTO[]}|null>(null);useEffect(()=>{void localFetch(`/api/albums/${id}`).then(async r=>{if(r.ok)setData(await r.json() as {album:AlbumDTO;artist:ArtistDTO|null;tracks:TrackDTO[]});});},[id]);return data?<div className="p-4 md:p-6"><AlbumHeader album={data.album} artist={data.artist} tracks={data.tracks}/><div className="mt-6"><TrackList tracks={data.tracks} showAlbum={false}/></div></div>:<p className="p-8 text-center text-white/50">الألبوم غير محفوظ على الجهاز.</p>;}
