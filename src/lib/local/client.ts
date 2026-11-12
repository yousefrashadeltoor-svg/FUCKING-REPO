// Client-side application operations. These are ordinary function calls, not
// HTTP endpoints. The legacy /api names are an internal compatibility adapter.
import type { ArtistDTO, ArtistProfileDTO, PlaylistDetailDTO, SearchResultsDTO, StatsDTO, TrackDTO } from "@/lib/types";
import { usePlayerStore } from "@/stores/player-store";
import { nativeSearch, isNativeHost } from "@/lib/platform/native";
import { hydrateLocal, localSnapshot, localTrack, remember, recordHistory, mutateLocal, likedLocalTracks } from "./state";
import { albumsFromTracks, makeTrack, playlistMeta, searchLocal, sourceFromUrl, stableId } from "./model";
import { onlineFetch, networkMessage } from "./online";
import { egyptianStations, arabicStations, worldStations, quranStations, cultureStations, searchStations, stationByUuid } from "@/lib/data/radio";
import { loadTv } from "@/lib/data/tv";
import { SURAHS, RECITERS, surahUrl } from "@/lib/data/quran";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (message: string, status = 400) => json({ error: message }, status);
async function body(req: RequestInfo | URL, init?: RequestInit): Promise<Record<string, unknown>> {
  try {
    if (typeof init?.body === "string") return JSON.parse(init.body) as Record<string, unknown>;
    if (req instanceof Request) return await req.clone().json() as Record<string, unknown>;
  } catch { /* empty body */ }
  return {};
}

interface AudiusTrack { id:string; title:string; duration:number; genre:string; artwork?: Record<string,string>; user:{id:string;name:string;handle:string}; permalink:string }
async function audiusSearch(q: string): Promise<TrackDTO[]> {
  const hosts = await (await onlineFetch("https://api.audius.co")).json() as {data:string[]};
  const host = hosts.data?.find(Boolean);
  if (!host) throw new Error("مصدر Audius غير متاح");
  const data = await (await onlineFetch(`${host}/v1/tracks/search?query=${encodeURIComponent(q)}&limit=30`)).json() as {data:AudiusTrack[]};
  return (data.data ?? []).map(t => makeTrack({
    title:t.title, artistName:t.user.name, artistId:stableId(`audius:${t.user.id}`), source:"audius", sourceId:t.id,
    streamUrl:`${host}/v1/tracks/${t.id}/stream`, coverUrl:t.artwork?.["1000x1000"] ?? t.artwork?.["480x480"] ?? null,
    durationSec:t.duration, genre:t.genre, codec:"audio",
  }));
}

async function search(q: string, source: string): Promise<SearchResultsDTO> {
  const s = localSnapshot();
  const local = searchLocal(s,q,usePlayerStore.getState().likedIds);
  const empty: SearchResultsDTO = { tracks:local, albums:albumsFromTracks(local), artists:[], playlists:s.playlists.filter(p => p.title.toLowerCase().includes(q.toLowerCase())).map(playlistMeta) };
  if (!q.trim()) return empty;
  const sourceUrl = sourceFromUrl(q);
  if (sourceUrl) {
    const t = makeTrack({title:q,artistName:new URL(q).hostname,source:sourceUrl,sourceId:q,streamUrl:q,codec:sourceUrl === "youtube" ? "iframe" : "audio"});
    remember([t]); return {...empty,tracks:[t],albums:[],playlists:[]};
  }
  if (!navigator.onLine) return empty;
  try {
    let tracks: TrackDTO[];
    if (isNativeHost() && source !== "audius" && source !== "archive") tracks = (await nativeSearch(q,source)).map(t => makeTrack(t));
    else tracks = await audiusSearch(q);
    remember(tracks);
    const artists = new Map<number,ArtistDTO>();
    for (const t of tracks) if (!artists.has(t.artistId)) artists.set(t.artistId,{
      id:t.artistId,name:t.artistName,slug:encodeURIComponent(t.artistName),bio:null,imageUrl:t.coverUrl,
      verified:false,monthlyListeners:0,genres:t.genre?[t.genre]:[],source:t.source,sourceId:null,
      following:s.followedIds.includes(t.artistId),followers:0,
    });
    mutateLocal(st => { for (const a of artists.values()) if (!st.artists[String(a.id)]) st.artists[String(a.id)] = a; });
    return {tracks,albums:albumsFromTracks(tracks),artists:[...artists.values()],playlists:empty.playlists,sources:{[tracks[0]?.source ?? "local"]:tracks.length}};
  } catch (e) {
    if (local.length) return {...empty, sources:{local:local.length}};
    throw new Error(networkMessage(e));
  }
}

function artistProfile(id: number): ArtistProfileDTO | null {
  const s = localSnapshot();
  const artist = s.artists[String(id)];
  if (!artist) return null;
  const tracks = Object.values(s.tracks).filter(t => t.artistId === id);
  const albums = albumsFromTracks(tracks,s.likedAlbumIds);
  return {artist:{...artist,following:s.followedIds.includes(id)},topTracks:tracks,topPlays:{},albums,singles:[],collaborations:[],videos:[],live:[],featuredOn:[],related:[],stats:{tracks:tracks.length,albums:albums.length,plays:s.history.filter(h => tracks.some(t => t.id === h.trackId)).length}};
}

function stats(): StatsDTO {
  const s = localSnapshot();
  const counts = new Map<number,number>();
  for (const h of s.history) counts.set(h.trackId,(counts.get(h.trackId)??0)+1);
  const topTracks = [...counts].sort((a,b)=>b[1]-a[1]).map(([id])=>localTrack(id)).filter((t):t is TrackDTO=>!!t).slice(0,20);
  const genres = new Map<string,number>();
  for (const [id,n] of counts) { const g = localTrack(id)?.genre; if(g) genres.set(g,(genres.get(g)??0)+n); }
  return {totalPlays:s.history.length,totalMinutes:Math.round(s.history.reduce((n,h)=>n+h.seconds,0)/60),topTracks,
    topArtists:[],genreDistribution:[...genres].map(([genre,plays])=>({genre,plays})).sort((a,b)=>b.plays-a.plays)};
}

export async function localFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw,"https://donmuse.local");
  if (!url.pathname.startsWith("/api/")) return fetch(input,init);
  await hydrateLocal();
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const p = url.pathname.replace(/^\/api\//,"").replace(/\/$/,"");
  const seg = p.split("/");
  const s = localSnapshot();
  const player = usePlayerStore.getState();
  try {
    if (p === "me") return json({id:1,name:"مستمع DON MUSE",email:"",avatarUrl:null,tier:"free",locale:"ar"});
    if (p === "health") return json({mode:"local",backend:false,database:false,ui:true,native:isNativeHost(),online:navigator.onLine});
    if (p === "search") return json(await search(url.searchParams.get("q") ?? "",url.searchParams.get("source") ?? "all"));
    if (p === "likes") {
      if (method === "POST") { const b = await body(input,init); const id=Number(b.trackId); if(localTrack(id)) player.toggleLike(id); return json({liked:player.likedIds.includes(id)}); }
      return json(likedLocalTracks());
    }
    if (p === "history") {
      if (method === "POST") { const b=await body(input,init); recordHistory(Number(b.trackId),Math.max(0,Number(b.durationListenedSec)||0)); return json({ok:true}); }
      const ids = [...new Set(s.history.map(h=>h.trackId))];
      return json(ids.map(localTrack).filter(Boolean));
    }
    if (p === "stats") return json(stats());
    if (p === "home") {
      const recent = [...new Set(s.history.map(h=>h.trackId))].map(localTrack).filter((t):t is TrackDTO=>!!t);
      const tracks = recent.length ? recent : Object.values(s.tracks).slice(0,30);
      return json({sections:tracks.length?[{id:"hero",title:"مكتبتك",subtitle:"موسيقاك المحفوظة على هذا الجهاز",kind:"tracks",items:tracks}]:[]});
    }
    if (p === "playlists") {
      if (method === "POST") {
        const b=await body(input,init); let pl:PlaylistDetailDTO|undefined;
        mutateLocal(st=>{pl={id:Date.now(),title:String(b.title||"قائمة جديدة"),slug:"",description:String(b.description||""),coverUrl:null,ownerId:1,ownerName:"أنت",collaborative:false,isPublic:false,trackCount:0,durationSec:0,createdAt:new Date().toISOString(),tracks:[]};st.playlists.unshift(pl);});
        return json(pl,201);
      }
      return json(s.playlists.map(playlistMeta));
    }
    if (seg[0] === "playlists" && seg[1]) {
      const pl=s.playlists.find(x=>String(x.id)===seg[1]); if(!pl) return fail("القائمة غير موجودة",404);
      if(method==="DELETE"){mutateLocal(st=>{st.playlists=st.playlists.filter(x=>x.id!==pl.id);});return json({ok:true});}
      if(method==="PATCH"){const b=await body(input,init);mutateLocal(()=>{if(typeof b.title==="string")pl.title=b.title;if(typeof b.description==="string")pl.description=b.description;});return json(playlistMeta(pl));}
      if(seg[2]==="tracks"){
        const b=await body(input,init);
        if(method==="POST"){const ids=(Array.isArray(b.trackIds)?b.trackIds:[b.trackId]).map(Number);const tracks=ids.map(localTrack).filter((t):t is TrackDTO=>!!t);mutateLocal(()=>{pl.tracks.push(...tracks.filter(t=>!pl.tracks.some(x=>x.id===t.id)));});return json(playlistMeta(pl));}
        if(method==="DELETE"){mutateLocal(()=>{pl.tracks=pl.tracks.filter(t=>t.id!==Number(b.trackId));});return json(playlistMeta(pl));}
      }
      if(seg[2]==="reorder" && method==="POST"){const b=await body(input,init);const ids=(b.trackIds as number[])??[];mutateLocal(()=>{pl.tracks=ids.map(localTrack).filter((t):t is TrackDTO=>!!t);});return json(playlistMeta(pl));}
      return json(pl);
    }
    if (seg[0]==="tracks" && seg[1]) {
      const t=localTrack(Number(seg[1])); if(!t)return fail("لم يتم العثور على الملف محليًا",404);
      if(seg[2]==="lyrics")return json({lyrics:t.lyrics,source:"local"});
      if(seg[2]==="resolve")return json({youtubeId:t.source==="youtube"?t.sourceId:null});
      return json(t);
    }
    if(p==="follows")return json(s.followedIds.map(id=>s.artists[String(id)]).filter(Boolean));
    if(seg[0]==="artists"&&seg[1]){
      const id=Number(seg[1]);
      if(seg[2]==="follow"){let following=false;mutateLocal(st=>{following=!st.followedIds.includes(id);st.followedIds=following?[...st.followedIds,id]:st.followedIds.filter(x=>x!==id);});return json({following});}
      if(seg[2]==="profile"){const profile=artistProfile(id);return profile?json(profile):fail("الفنان غير محفوظ على الجهاز",404);}
      const a=s.artists[seg[1]];return a?json(a):fail("الفنان غير موجود",404);
    }
    if(p==="albums"){const tracks=Object.values(s.tracks);return json(albumsFromTracks(tracks,s.likedAlbumIds));}
    if(seg[0]==="albums"&&seg[1]){
      if(seg[2]==="like"){const b=await body(input,init);const id=Number(b.albumId);mutateLocal(st=>{st.likedAlbumIds=st.likedAlbumIds.includes(id)?st.likedAlbumIds.filter(x=>x!==id):[...st.likedAlbumIds,id];});return json({liked:s.likedAlbumIds.includes(id)});}
      const tracks=Object.values(s.tracks);const album=albumsFromTracks(tracks,s.likedAlbumIds).find(a=>String(a.id)===seg[1]);
      if(!album)return fail("الألبوم غير محفوظ",404);
      return json({album,artist:s.artists[String(album.artistId)]??null,tracks:tracks.filter(t=>(t.albumId??stableId(`album:${t.artistName}:${t.albumTitle}`))===album.id)});
    }
    if(p==="radio"){
      const uuid=url.searchParams.get("uuid");if(uuid){const station=await stationByUuid(uuid);return json({egypt:station?.countryCode==="EG"?[station]:[],world:station&&station.countryCode!=="EG"?[station]:[]});}
      const q=url.searchParams.get("q")?.trim()??"";const tag=url.searchParams.get("tag")??"";
      if(q){const all=await searchStations(q,100);return json({egypt:all.filter(x=>x.countryCode==="EG"),arabic:[],quran:[],culture:[],world:all.filter(x=>x.countryCode!=="EG")});}
      if(tag){const all=tag==="world"?await worldStations(100):await import("@/lib/data/radio").then(m=>m.stationsByTag(tag,100));return json({egypt:[],arabic:[],quran:[],culture:[],world:all});}
      const [egypt,arabic,quran,culture,world]=await Promise.all([egyptianStations(80),arabicStations(80),quranStations(60),cultureStations(60),worldStations(80)]);
      return json({egypt,arabic,quran,culture,world});
    }
    if(p==="tv"){const {channels}=await loadTv();return json({channels});}
    if(p==="quran")return json({surahs:SURAHS,reciters:RECITERS});
    if(p==="quran/stream"||p==="quran/download"){
      const n=Number(url.searchParams.get("surah"));const code=url.searchParams.get("reciter")??"";const q=(url.searchParams.get("q")??"high") as "low"|"medium"|"high";
      const direct=surahUrl(n,code,q);return direct?json({url:direct}):fail("القارئ أو السورة غير صحيحين");
    }
    if(p==="reels"){
      const tracks=Object.values(s.tracks).filter(t=>t.source!=="quran"&&t.source!=="radio");
      return json({items:tracks.map(track=>({track,artist:s.artists[String(track.artistId)]??null,featuring:null,reason:"من مكتبتك",score:0,likes:0,views:0})),cursor:null});
    }
    if(p.startsWith("youtube/"))return fail("تسجيل YouTube الرسمي يحتاج خادم OAuth، وهو غير موجود في النسخة المحلية. استخدم البحث والتحميل المباشران.",501);
    return fail("هذه العملية غير متاحة في التطبيق المحلي",404);
  } catch(e){return fail(networkMessage(e),502);}
}
