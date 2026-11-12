import test from "node:test";
import assert from "node:assert/strict";
import { formatTime, clamp, EQ_BAND_FREQUENCIES, EQ_PRESETS } from "../src/lib/utils";

test("time formatting handles invalid values and long files", () => {
  assert.equal(formatTime(65),"1:05"); assert.equal(formatTime(3601),"60:01"); assert.equal(formatTime(NaN),"0:00"); assert.equal(formatTime(-2),"0:00");
});
test("EQ has ten matching, ordered bands and valid presets", () => {
  assert.deepEqual(EQ_BAND_FREQUENCIES,[60,170,310,600,1000,3000,6000,12000,14000,16000]);
  for (const bands of Object.values(EQ_PRESETS)) { assert.equal(bands.length,10); assert.ok(bands.every(v=>v>=-12&&v<=12)); }
});
test("clamp preserves boundaries", () => { assert.equal(clamp(-1,0,1),0); assert.equal(clamp(2,0,1),1); assert.equal(clamp(.4,0,1),.4); });
