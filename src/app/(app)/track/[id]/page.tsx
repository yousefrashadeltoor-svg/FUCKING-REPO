import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TrackLanding } from "@/components/tracks/TrackLanding";
import { localFetch } from "@/lib/local/client";
import type { TrackDTO } from "@/lib/types";
export default function Page(){const {id}=useParams<{id:string}>();const [track,setTrack]=useState<TrackDTO|null>(null);const [error,setError]=useState("");useEffect(()=>{void localFetch(`/api/tracks/${id}`).then(async r=>{if(r.ok)setTrack(await r.json() as TrackDTO);else setError("هذا المقطع غير محفوظ على الجهاز. افتح مكتبته أولًا أو ابحث عنه.");});},[id]);return track?<TrackLanding track={track}/>:<p className="p-8 text-center text-sm text-white/60">{error||"جارٍ فتح المقطع…"}</p>;}
