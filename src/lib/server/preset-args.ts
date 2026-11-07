// Shared mapping: an audio preset id -> ffmpeg args / container / ext / mime.
// Used by the full-download route and the clip route so a trimmed segment can
// be exported in ANY of the same formats/qualities as a full download.
import { AUDIO_PRESETS } from "./transcode";

export interface ClipFormat {
  ext: string;
  mime: string;
  codecArgs: string[]; // audio encoder args (no -i / no output)
  container: string; // -f value
  lossless: boolean;
  label: string;
}

const DEFAULT: ClipFormat = {
  ext: "mp3", mime: "audio/mpeg",
  codecArgs: ["-c:a", "libmp3lame", "-b:a", "256k", "-id3v2_version", "3"],
  container: "mp3", lossless: false, label: "MP3 256k",
};

export function clipFormat(id: string): ClipFormat {
  const p = AUDIO_PRESETS.find((x) => x.id === id);
  if (!p) return DEFAULT;
  const codecArgs = ["-c:a", p.codec];
  if (!p.lossless) codecArgs.push("-b:a", `${p.bitrateKbps}k`);
  if (p.codec === "libmp3lame") codecArgs.push("-id3v2_version", "3");
  if (p.codec === "pcm_s16le") codecArgs.push("-ar", "44100", "-ac", "2");
  if (p.codec === "aac") codecArgs.push("-movflags", "+faststart");
  return { ext: p.ext, mime: p.mime, codecArgs, container: p.container, lossless: p.lossless, label: p.label };
}
