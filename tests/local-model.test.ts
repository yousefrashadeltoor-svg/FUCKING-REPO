import test from "node:test";
import assert from "node:assert/strict";
import { stableId, makeTrack, sanitizeFilename, sourceFromUrl, albumsFromTracks, rememberTracks, emptySnapshot } from "../src/lib/local/model";

test("local identities are deterministic and positive", () => {
  assert.equal(stableId("youtube:abc"), stableId("youtube:abc"));
  assert.notEqual(stableId("youtube:abc"), stableId("soundcloud:abc"));
  assert.ok(stableId("موسيقاي") > 0);
});
test("unknown track metrics remain unknown, never fabricated", () => {
  const t = makeTrack({ title:"Song", artistName:"Artist", source:"internal", sourceId:"x", streamUrl:"file:///music/x.mp3" });
  assert.equal(t.playCount, 0); assert.equal(t.bpm, 0); assert.deepEqual(t.waveform, []); assert.equal(t.lossless, false);
});
test("filenames cannot escape a directory or contain control bytes", () => {
  const name = sanitizeFilename('../a/b\\c:d*e?f"g<h>i|j\u0000k', "mp3");
  assert.equal(name.endsWith(".mp3"), true); assert.match(name, /^[^/\\:*?"<>|\u0000-\u001f]+$/);
  assert.equal(sanitizeFilename("", "flac"), "DON MUSE.flac");
});
test("only implemented page resolvers are identified", () => {
  assert.equal(sourceFromUrl("https://youtu.be/abc"), "youtube");
  assert.equal(sourceFromUrl("https://soundcloud.com/a/b"), "soundcloud");
  assert.equal(sourceFromUrl("https://open.spotify.com/track/x"), null);
  assert.equal(sourceFromUrl("file:///tmp/song.mp3"), null);
});
test("albums and remembered tracks are derived from real local metadata", () => {
  const a = makeTrack({ title:"One", artistName:"A", albumTitle:"Album", source:"internal", sourceId:"1", streamUrl:"file:///1.mp3", durationSec:10 });
  const b = makeTrack({ title:"Two", artistName:"A", albumTitle:"Album", source:"internal", sourceId:"2", streamUrl:"file:///2.mp3", durationSec:20 });
  const albums = albumsFromTracks([a,b]); assert.equal(albums.length, 1); assert.equal(albums[0].totalTracks, 2);
  const snapshot = emptySnapshot(); rememberTracks(snapshot, [a,b]); assert.equal(Object.keys(snapshot.tracks).length, 2); assert.equal(snapshot.artists[String(a.artistId)].name, "A");
});
