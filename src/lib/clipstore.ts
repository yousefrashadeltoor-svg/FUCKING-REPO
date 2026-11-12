// Local radio clips: media blobs in Cache Storage, small metadata in local KV.
export interface SavedClip {id:string;name:string;stationName:string;country:string;cover:string|null;start:number;end:number;seconds:number;savedAt:number;size:number;blob:Blob}
const CACHE="donmuse-clips-v1";const KEY="dm:donmuse.clips";
const key=(id:string)=>`/__donmuse_clip__/${encodeURIComponent(id)}`;
type Meta=Omit<SavedClip,"blob">;
function metas():Meta[]{try{return JSON.parse(localStorage.getItem(KEY)||"[]") as Meta[];}catch{return [];}}
export async function addClip(c:SavedClip):Promise<SavedClip>{const cache=await caches.open(CACHE);await cache.put(key(c.id),new Response(c.blob,{headers:{"Content-Type":c.blob.type}}));const {blob:_blob,...meta}=c;localStorage.setItem(KEY,JSON.stringify([meta,...metas().filter(x=>x.id!==c.id)].slice(0,500)));return c;}
export async function listClips():Promise<SavedClip[]>{const cache=await caches.open(CACHE);const out:SavedClip[]=[];for(const m of metas().sort((a,b)=>b.savedAt-a.savedAt)){const r=await cache.match(key(m.id));if(r)out.push({...m,blob:await r.blob()});}return out;}
export async function deleteClip(id:string):Promise<void>{await (await caches.open(CACHE)).delete(key(id));localStorage.setItem(KEY,JSON.stringify(metas().filter(x=>x.id!==id)));}
