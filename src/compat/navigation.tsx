import { useMemo } from "react";
import { useLocation, useNavigate, useParams as useRouteParams } from "react-router-dom";
export function usePathname() { return useLocation().pathname; }
export function useSearchParams() { const l=useLocation(); return useMemo(()=>new URLSearchParams(l.search),[l.search]); }
export function useParams<T extends Record<string,string|undefined>>() { return useRouteParams() as T; }
export function useRouter() {
  const navigate=useNavigate();
  return useMemo(()=>({push:(href:string)=>{void navigate(href);},replace:(href:string)=>{void navigate(href,{replace:true});},back:()=>navigate(-1),forward:()=>navigate(1),refresh:()=>window.dispatchEvent(new Event("donmuse:refresh")),prefetch:()=>Promise.resolve()}),[navigate]);
}
export function notFound():never { throw new Error("NOT_FOUND"); }
export function redirect(href:string):never { window.location.replace(href); throw new Error("REDIRECT"); }
