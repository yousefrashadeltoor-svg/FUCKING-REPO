import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const read=(p:string)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
test("Android structural and bridge contract check passes", () => {
  const output=execFileSync(process.execPath,["scripts/check-android.mjs"],{cwd:new URL("../",import.meta.url),encoding:"utf8"});
  assert.match(output,/Android structure OK/);
});
test("APK routing uses an absolute router basename with relative Vite assets", () => {
  assert.match(read("src/main.tsx"),/\? "\/assets\/www"/);
  assert.match(read("android/app/src/main/java/fm/donmuse/app/DonMuseApp.kt"),/https:\/\/appassets\.androidplatform\.net/);
  assert.match(read("package.json"),(/"build:android"/));
});
test("native clips bypass network/FFmpeg and never persist a data URL", () => {
  const repo=read("android/app/src/main/java/fm/donmuse/app/download/DownloadRepository.kt");
  assert.match(repo,/format=="local-clip"/); assert.match(repo,/Never persist or broadcast/); assert.match(repo,/local\.writeBytes/);
  assert.match(read("src/components/radio/RadioRecorder.tsx"),/formatId:"local-clip"/);
});
test("widget stop uses a broadcast, not an unfulfilled foreground-service start", () => {
  const updater=read("android/app/src/main/java/fm/donmuse/app/widget/WidgetUpdater.kt");
  assert.match(updater,/PendingIntent\.getBroadcast/); assert.ok(!updater.includes("getForegroundService"));
});
