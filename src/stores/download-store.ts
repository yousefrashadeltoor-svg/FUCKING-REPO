import { create } from "zustand";
import { toast } from "sonner";
import { platformStorage } from "@/lib/storage";
import { isNativeHost, nativeDownloads, enqueueNativeDownload, downloadAction, type DownloadJob } from "@/lib/platform/native";
import { makeTrack, sanitizeFilename } from "@/lib/local/model";
import { remember } from "@/lib/local/state";
import type { TrackDTO } from "@/lib/types";

export type DlKind="full"|"clip"|"quran";
export type DlStatus="queued"|"working"|"paused"|"done"|"error";
export interface DlItem {
  id:string;title:string;artist:string;cover:string|null;kind:DlKind;preset:string;
  url:string;sourceUrl:string;formatId:string;filename:string;mime:string;status:DlStatus;
  size:number|null;error:string|null;addedAt:number;progress:number;received:number;total:number;
  uri?:string;track?:TrackDTO;startSec?:number;endSec?:number;headers?:Record<string,string>;
}
interface DlState {
  items:DlItem[];running:boolean;loaded:boolean;
  init:()=>Promise<void>;add:(item:Partial<DlItem>&Pick<DlItem,"title"|"url"|"filename">)=>void;
  remove:(id:string)=>void;clear:()=>void;clearDone:()=>void;run:()=>Promise<void>;
  action:(id:string,action:"pause"|"resume"|"retry")=>Promise<void>;
}
const KEY="donmuse.downloads.v1";
const controllers=new Map<string,AbortController>();
let initPromise:Promise<void>|null=null;
const uid=()=>`dl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const cacheKey=(id:string)=>`/__donmuse_download__/${encodeURIComponent(id)}`;
function persist(items:DlItem[]){void platformStorage.setItem(KEY,JSON.stringify(items.map(x=>({...x,status:x.status==="working"?"queued":x.status})))).catch(()=>toast.error("مساحة التخزين غير كافية لحفظ قائمة التحميل"));}
function fromNative(j:DownloadJob):DlItem{return {...j,kind:j.kind ?? (j.startSec!==undefined?"clip":"full"),url:j.url||j.sourceUrl,size:j.size??null,addedAt:j.addedAt||Date.now()};}
function patch(set:(fn:(s:DlState)=>Partial<DlState>)=>void,get:()=>DlState,id:string,value:Partial<DlItem>){set(s=>({items:s.items.map(x=>x.id===id?{...x,...value}:x)}));persist(get().items);}

export const useDownloadStore=create<DlState>()((set,get)=>({
  items:[],running:false,loaded:false,
  init:()=>{
    if(!initPromise)initPromise=(async()=>{
      try{const raw=await platformStorage.getItem(KEY);const saved=raw?JSON.parse(raw) as DlItem[]:[];const native=isNativeHost()?nativeDownloads().map(fromNative):[];const merged=new Map(saved.map(x=>[x.id,x]));for(const j of native)merged.set(j.id,j);set({items:[...merged.values()].sort((a,b)=>b.addedAt-a.addedAt),loaded:true});}catch{set({loaded:true});}
    })();
    return initPromise;
  },
  add:(input)=>{
    const item:DlItem={id:uid(),artist:"",cover:null,kind:"full",preset:"original",sourceUrl:input.sourceUrl??input.url,formatId:input.formatId??"original",mime:"audio/mpeg",status:"queued",size:null,error:null,addedAt:Date.now(),progress:0,received:0,total:0,...input};
    if(item.formatId!=="local-clip"&&get().items.some(x=>x.sourceUrl===item.sourceUrl&&x.formatId===item.formatId&&x.preset===item.preset&&x.status!=="error"))return;
    set(s=>({items:[item,...s.items]}));persist(get().items);
    if(isNativeHost())void get().run();
  },
  remove:(id)=>{controllers.get(id)?.abort();if(isNativeHost())void downloadAction(id,"cancel").catch(()=>{});set(s=>({items:s.items.filter(x=>x.id!==id)}));persist(get().items);if(!isNativeHost())void caches.open("donmuse-downloads-v1").then(c=>c.delete(cacheKey(id)));},
  clear:()=>{for(const i of get().items)get().remove(i.id);},
  clearDone:()=>{for(const i of get().items)if(i.status==="done"||i.status==="error")set(s=>({items:s.items.filter(x=>x.id!==i.id)}));persist(get().items);},
  action:async(id,action)=>{const item=get().items.find(x=>x.id===id);if(!item)return;if(isNativeHost()){try{const j=await downloadAction(id,action);if(j)patch(set,get,id,fromNative(j));}catch(e){toast.error((e as Error).message);}return;}if(action==="pause"){controllers.get(id)?.abort();patch(set,get,id,{status:"paused"});}else{patch(set,get,id,{status:"queued",error:null});void get().run();}},
  run:async()=>{
    if(get().running)return;set({running:true});
    try{
      if(isNativeHost()){
        for(const item of get().items.filter(x=>x.status==="queued")){
          try{const j=await enqueueNativeDownload({...item,size:item.size??undefined});patch(set,get,item.id,fromNative(j));}catch(e){patch(set,get,item.id,{status:"error",error:(e as Error).message});}
        }
        return;
      }
      for(const queued of get().items.filter(x=>x.status==="queued")){
        const id=queued.id;const ctrl=new AbortController();controllers.set(id,ctrl);patch(set,get,id,{status:"working",error:null,progress:0,received:0});
        try{
          const item=get().items.find(x=>x.id===id);if(!item)continue;
          if(!/^https?:\/\//i.test(item.url))throw new Error("يلزم رابط ملف مباشر HTTPS، أو تطبيق أندرويد لفك روابط المنصات.");
          const res=await fetch(item.url,{signal:ctrl.signal,headers:item.headers});if(!res.ok)throw new Error(`HTTP ${res.status}: المصدر رفض التنزيل`);
          const total=Number(res.headers.get("Content-Length"))||0;const chunks:Uint8Array[]=[];let received=0;let last=0;
          if(res.body){const reader=res.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.byteLength;if(Date.now()-last>180){last=Date.now();patch(set,get,id,{received,total,progress:total?Math.round(received/total*100):0});}}}
          else {const b=new Uint8Array(await res.arrayBuffer());chunks.push(b);received=b.byteLength;}
          const blob=new Blob(chunks as BlobPart[],{type:res.headers.get("Content-Type")||item.mime});
          await (await caches.open("donmuse-downloads-v1")).put(cacheKey(id),new Response(blob,{headers:{"Content-Type":blob.type}}));
          patch(set,get,id,{status:"done",size:blob.size,received:blob.size,total:blob.size,progress:100,uri:`cache:${id}`});
          const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=item.filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10_000);
        }catch(e){if(ctrl.signal.aborted)patch(set,get,id,{status:"paused"});else patch(set,get,id,{status:"error",error:(e as Error).message||"فشل التنزيل"});}finally{controllers.delete(id);}
      }
    }finally{set({running:false});}
  },
}));

if(typeof window!=="undefined")window.addEventListener("donmuse:native:downloads",e=>{
  const jobs=(e as CustomEvent<DownloadJob[]>).detail;if(!Array.isArray(jobs))return;
  useDownloadStore.setState(s=>{const map=new Map(s.items.map(x=>[x.id,x]));for(const j of jobs)map.set(j.id,{...map.get(j.id),...fromNative(j)});const items=[...map.values()];persist(items);return {items};});
});

export function enqueueTrack(track:TrackDTO,preset="original"){
  remember([track]);const ext=preset.startsWith("mp3-")?"mp3":preset.startsWith("m4a-")?"m4a":preset==="opus-160"?"opus":preset==="flac"?"flac":preset==="alac"?"m4a":preset==="wav"?"wav":track.mimeType?.split("/")[1]||"mp3";
  const sourceUrl=track.source==="youtube"&&track.sourceId?`https://www.youtube.com/watch?v=${track.sourceId}`:track.streamUrl;
  useDownloadStore.getState().add({title:track.title,artist:track.artistName,cover:track.coverUrl,kind:"full",preset,formatId:"original",url:sourceUrl,sourceUrl,filename:sanitizeFilename(`${track.title} - ${track.artistName}`,ext),mime:track.mimeType||"audio/mpeg",track});
}
export async function downloadTrackForOffline(item:DlItem):Promise<TrackDTO|null>{
  let uri=item.uri??"";
  if(uri.startsWith("cache:")){const response=await (await caches.open("donmuse-downloads-v1")).match(cacheKey(item.id));if(!response)return null;uri=URL.createObjectURL(await response.blob());}
  if(!uri)return null;
  const track=makeTrack({...item.track,title:item.title,artistName:item.artist||"ملف محمّل",source:"local",sourceId:item.id,streamUrl:uri,coverUrl:item.cover,localUri:uri,mimeType:item.mime,isDeviceItem:true});remember([track]);return track;
}
