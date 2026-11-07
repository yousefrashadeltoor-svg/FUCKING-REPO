import type { RadioStationDTO, TrackDTO } from "@/lib/types";

export function stationToTrack(s: RadioStationDTO): TrackDTO {
  const streamUrl = `/api/radio/stream?u=${encodeURIComponent(s.streamUrl)}&id=${encodeURIComponent(s.id)}`;
  return {
    id: -Math.abs(hash(s.id)),
    title: s.name,
    artistId: 0,
    artistName: `${s.country}${s.bitrate ? ` · ${s.bitrate} kbps ${s.codec}` : s.codec ? ` · ${s.codec}` : ""}`,
    albumId: null,
    albumTitle: "LIVE RADIO",
    coverUrl: s.coverUrl,
    durationSec: 0,
    source: "radio",
    sourceId: s.id,
    previewUrl: null,
    streamUrl,
    waveform: [],
    loudnessLufs: -14,
    bpm: 0,
    key: null,
    energy: 0.5,
    valence: 0.5,
    danceability: 0.5,
    acousticness: 0.5,
    explicit: false,
    genre: s.genre,
    language: s.mood,
    year: new Date().getFullYear(),
    isrc: null,
    codec: s.codec || "stream",
    bitrate: s.bitrate,
    lossless: false,
    playCount: s.listeners,
    lyrics: [],
    liked: false,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}
