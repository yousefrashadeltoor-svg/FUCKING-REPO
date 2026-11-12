import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArtistProfile } from "@/components/artists/ArtistProfile";
import { localFetch } from "@/lib/local/client";
import type { ArtistProfileDTO } from "@/lib/types";
export default function Page(){const {id}=useParams<{id:string}>();const [data,setData]=useState<ArtistProfileDTO|null>(null);useEffect(()=>{const load=()=>{void localFetch(`/api/artists/${id}/profile`).then(async r=>{if(r.ok)setData(await r.json() as ArtistProfileDTO);});};load();window.addEventListener("donmuse:refresh",load);return()=>window.removeEventListener("donmuse:refresh",load);},[id]);return <ArtistProfile artistId={Number(id)} initial={data}/>;}
