// ============================================================================
//  Minimal ID3v2.3 writer (browser + Node safe, pure Uint8Array).
//  Used by the Radio Recorder to tag saved clips with title / artist / album
//  and an embedded JPEG cover (APIC). Prepends the tag to raw MP3 bytes.
// ============================================================================

function syncsafe(n: number): Uint8Array {
  return new Uint8Array([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function ascii(s: string): Uint8Array {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0xff));
}

/** UTF-16LE with BOM (encoding byte 0x01) — safe for Arabic / any script. */
function utf16(s: string): Uint8Array {
  const out = new Uint8Array(2 + s.length * 2 + 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out; // trailing 0x00 0x00 terminator already zero
}

function frame(id: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(10 + body.length);
  out.set(ascii(id), 0);
  out.set(u32(body.length), 4);
  // flags = 0
  out.set(body, 10);
  return out;
}

function textFrame(id: string, text: string): Uint8Array {
  const enc = utf16(text);
  const body = new Uint8Array(1 + enc.length);
  body[0] = 0x01;
  body.set(enc, 1);
  return frame(id, body);
}

function apicFrame(jpeg: Uint8Array, mime = "image/jpeg"): Uint8Array {
  const m = ascii(mime);
  const desc = ascii("Cover");
  const body = new Uint8Array(1 + m.length + 1 + 1 + desc.length + 1 + jpeg.length);
  let o = 0;
  body[o++] = 0x00; // ISO-8859-1 for description
  body.set(m, o);
  o += m.length;
  body[o++] = 0x00;
  body[o++] = 0x03; // picture type: front cover
  body.set(desc, o);
  o += desc.length;
  body[o++] = 0x00;
  body.set(jpeg, o);
  return frame("APIC", body);
}

export interface Id3Meta {
  title: string;
  artist: string;
  album?: string;
  comment?: string;
  cover?: Uint8Array | null;
  coverMime?: string;
}

/** Build a complete ID3v2.3 tag block. */
export function buildId3(meta: Id3Meta): Uint8Array {
  const frames: Uint8Array[] = [
    textFrame("TIT2", meta.title),
    textFrame("TPE1", meta.artist),
    textFrame("TALB", meta.album ?? "DON MUSE Radio"),
    textFrame("TENC", "DON MUSE"),
  ];
  if (meta.comment) frames.push(textFrame("TXXX", `comment\u0000${meta.comment}`));
  if (meta.cover && meta.cover.length > 0) frames.push(apicFrame(meta.cover, meta.coverMime ?? "image/jpeg"));
  const size = frames.reduce((a, f) => a + f.length, 0);
  const out = new Uint8Array(10 + size);
  out.set(ascii("ID3"), 0);
  out[3] = 0x03; // v2.3
  out[4] = 0x00;
  out[5] = 0x00; // flags
  out.set(syncsafe(size), 6);
  let o = 10;
  for (const f of frames) {
    out.set(f, o);
    o += f.length;
  }
  return out;
}

/** Prepend an ID3 tag to raw audio chunks and return a Blob. */
export function tagMp3(chunks: Uint8Array[], meta: Id3Meta, mime = "audio/mpeg"): Blob {
  const tag = buildId3(meta);
  return new Blob([tag as BlobPart, ...(chunks as BlobPart[])], { type: mime });
}
