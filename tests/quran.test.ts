import test from "node:test";
import assert from "node:assert/strict";
import { SURAHS, RECITERS, surahUrl, sourceUrl, reciterByCode } from "../src/lib/data/quran";

test("the catalog contains exactly the 114 surahs", () => {
  assert.equal(SURAHS.length, 114); assert.deepEqual(SURAHS.map(s=>s.n), Array.from({length:114},(_,i)=>i+1));
});
test("every configured reciter produces padded, direct HTTPS whole-surah URLs", () => {
  for (const r of RECITERS) for (const n of [1,9,10,99,100,114]) {
    const url = surahUrl(n,r.code); assert.match(url, /^https:\/\//); assert.ok(url.includes(String(n).padStart(3,"0")) || (url.includes("islamic.network") && url.endsWith(`/${n}.mp3`)), `${r.code}/${n}: ${url}`);
    assert.ok(!url.includes("/api/"), "Quran must not depend on an application server");
  }
});
test("quality selection changes the actual source URL", () => {
  const r = reciterByCode("basit")!; const low=surahUrl(18,"basit","low"); const high=surahUrl(18,"basit","high");
  assert.notEqual(low,high); assert.ok(r.sources.length>=2);
  assert.equal(sourceUrl(67,r,{source:"everyayah",dir:"Alafasy_128kbps",bitrate:128}), "https://everyayah.com/data/Alafasy_128kbps/067.mp3");
});
test("unknown reciter fails visibly instead of inventing a CDN path", () => assert.equal(surahUrl(1,"not-a-reciter"), ""));
