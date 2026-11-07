// ============================================================================
//  DON MUSE — UniversalPlaybackEngine
//  ---------------------------------------------------------------------------
//  One control interface over every audio source:
//    • YouTube Music  → full-length playback via the YouTube IFrame API
//                       (YouTubeBridge, hidden 1x1 player)
//    • Deezer / iTunes → 30s previews via dual HTMLAudioElements (gapless
//                       pre-buffering) routed through a WebAudio graph:
//                       element → MediaElementSource → elementGain →
//                       [10x BiquadFilter EQ] → masterGain → compressor →
//                       AnalyserNode → destination
//
//  Features: equal-power crossfade (0–15s, audio path), LUFS (EBU R128-style)
//  loudness normalization, 10-band graphic EQ, playback-rate control, sleep
//  timer with fade-out, gapless next-track pre-buffer, AnalyserNode tap for
//  the real-time spectrum visualizer.
// ============================================================================

import { clamp, EQ_BAND_FREQUENCIES } from "@/lib/utils";
import type { TrackDTO } from "@/lib/types";
import { YouTubeBridge } from "./youtube-bridge";
import { getTrackIdentity } from "@/lib/track-identity";

export type EngineEvent =
  | "play"
  | "pause"
  | "ended"
  | "timeupdate"
  | "durationchange"
  | "error"
  | "trackchange";

export type EngineEventHandler = (payload?: unknown) => void;

/** EBU R128-style reference loudness target (LUFS). */
const TARGET_LUFS = -14;

type Listener = { event: EngineEvent; handler: EngineEventHandler };
type SourceKind = "audio" | "youtube";

export class UniversalPlaybackEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private els: HTMLAudioElement[] = [];
  private elGains: GainNode[] = [];
  private eqChains: BiquadFilterNode[][] = [];
  private active = 0;
  private listeners: Listener[] = [];
  private current: TrackDTO | null = null;
  private loadedTrackKey: string | null = null;
  private normGain = 1;
  private volume = 0.8;
  private muted = false;
  private rate = 1;
  private crossfadeSec = 4;
  private loudnessNormalization = true;
  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepFadeTimer: ReturnType<typeof setTimeout> | null = null;

  // --- YouTube path ---
  private yt: YouTubeBridge | null = null;
  private ytPoll: ReturnType<typeof setInterval> | null = null;
  private lastYtDuration = 0;

  /** Which backend is currently driving playback. */
  private kind: SourceKind = "audio";

  /** Must be called from a user gesture at least once. */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.knee.value = 12;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.24;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.master.connect(comp);
      comp.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      for (let i = 0; i < 2; i++) {
        const el = new Audio();
        el.preload = "auto";
        el.crossOrigin = "anonymous";
        const src = this.ctx.createMediaElementSource(el);
        const g = this.ctx.createGain();
        const chain: BiquadFilterNode[] = EQ_BAND_FREQUENCIES.map((f) => {
          const bq = this.ctx!.createBiquadFilter();
          bq.type = "peaking";
          bq.frequency.value = f;
          bq.Q.value = f < 200 ? 0.8 : 1.2;
          bq.gain.value = 0;
          return bq;
        });
        src.connect(g);
        let node: AudioNode = g;
        for (const bq of chain) {
          node.connect(bq);
          node = bq;
        }
        node.connect(this.master!);
        el.addEventListener("timeupdate", () => {
          if (this.kind === "audio" && this.els[this.active] === el)
            this.emit("timeupdate", el.currentTime);
        });
        el.addEventListener("durationchange", () => {
          if (this.kind === "audio" && this.els[this.active] === el)
            this.emit("durationchange", el.duration);
        });
        el.addEventListener("ended", () => {
          if (this.kind === "audio" && this.els[this.active] === el) this.emit("ended");
        });
        el.addEventListener("error", () => {
          if (this.kind === "audio" && this.els[this.active] === el)
            this.emit("error", el.error?.message ?? "playback error");
        });
        el.addEventListener("play", () => {
          if (this.kind === "audio" && this.els[this.active] === el) this.emit("play");
        });
        el.addEventListener("pause", () => {
          if (this.kind === "audio" && this.els[this.active] === el) this.emit("pause");
        });
        this.els.push(el);
        this.elGains.push(g);
        this.eqChains.push(chain);
      }
      this.applyVolume();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private getYT(): YouTubeBridge {
    if (!this.yt) {
      this.yt = new YouTubeBridge();
      this.yt.onStateChange = (state) => {
        if (this.kind !== "youtube") return;
        if (state === YT.PlayerState.PLAYING) this.emit("play");
        else if (state === YT.PlayerState.PAUSED) this.emit("pause");
        else if (state === YT.PlayerState.ENDED) this.emit("ended");
      };
      this.yt.onError = (code) => {
        if (this.kind !== "youtube") return;
        this.emit(
          "error",
          code === 101 || code === 150
            ? "This video can't be embedded by its owner"
            : code === 100
              ? "Video not found"
              : `YouTube player error (${code})`,
        );
      };
    }
    return this.yt;
  }

  /* ------------------------------ events ------------------------------ */

  on(event: EngineEvent, handler: EngineEventHandler): () => void {
    const l: Listener = { event, handler };
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  private emit(event: EngineEvent, payload?: unknown) {
    for (const l of [...this.listeners]) if (l.event === event) l.handler(payload);
  }

  /* --------------------------- configuration --------------------------- */

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
    this.applyVolume();
    if (this.kind === "youtube" && this.yt) {
      this.yt.setVolume(this.muted ? 0 : this.volume);
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolume();
    if (this.kind === "youtube" && this.yt) {
      this.yt.setVolume(this.muted ? 0 : this.volume);
    }
  }

  setPlaybackRate(r: number) {
    this.rate = clamp(r, 0.5, 3);
    for (const el of this.els) el.playbackRate = this.rate;
    if (this.yt) this.yt.setPlaybackRate(this.rate);
  }

  /** Map the app quality preference onto YouTube's playback quality. */
  setQuality(q: "auto" | "low" | "high" | "lossless") {
    if (!this.yt) return;
    const map = { auto: "default", low: "medium", high: "hd1080", lossless: "hd2160" } as const;
    this.yt.setPlaybackQuality(map[q] as YT.SuggestedVideoQuality);
  }

  setCrossfade(sec: number) {
    this.crossfadeSec = clamp(sec, 0, 15);
  }

  setLoudnessNormalization(on: boolean) {
    this.loudnessNormalization = on;
    this.applyVolume();
  }

  /** Set all 10 EQ band gains (dB). Applies to the audio-element path only —
   *  YouTube's iframe audio cannot be routed through WebAudio. */
  setEq(bands: number[]) {
    for (let chain = 0; chain < this.eqChains.length; chain++) {
      this.eqChains[chain].forEach((bq, i) => {
        bq.gain.value = clamp(bands[i] ?? 0, -24, 24);
      });
    }
  }

  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.volume * this.normGain;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  private computeNormGain(track: TrackDTO): number {
    if (!this.loudnessNormalization) return 1;
    const delta = TARGET_LUFS - track.loudnessLufs;
    return clamp(Math.pow(10, delta / 20), 0.25, 4);
  }

  /* ----------------------------- playback ------------------------------ */

  /** Load + play a track. Routes to YouTube or the audio-element graph by source. */
  async load(track: TrackDTO, opts: { autoplay?: boolean; crossfade?: boolean } = {}): Promise<void> {
    this.ensureContext();
    const { autoplay = true, crossfade = true } = opts;
    this.cancelSleepTimer();
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    // Store effects and gesture handlers may both load the same track.
    // Compare the full provider identity, not the numeric ID alone.
    const trackKey = getTrackIdentity(track);
    if (this.loadedTrackKey === trackKey) {
      if (autoplay) await this.play();
      return;
    }
    this.loadedTrackKey = trackKey;
    this.current = track;
    this.normGain = this.computeNormGain(track);

    // YouTube tracks play through our audio proxy by default → the WebAudio
    // graph (10-band EQ, loudness, crossfade) applies. codec "iframe" opts out.
    if (track.source === "youtube" && track.sourceId && track.codec === "iframe") {
      this.loadYouTube(track, autoplay, crossfade);
    } else {
      // Live radio + Quran: never crossfade (infinite stream / sacred) and skip pre-buffer.
      const noXf = track.source === "radio" || track.source === "quran";
      this.loadAudio(track, autoplay, noXf ? false : crossfade);
    }
    this.emit("trackchange", track);
    this.applyVolume();
  }

  private loadYouTube(track: TrackDTO, autoplay: boolean, crossfade: boolean) {
    const yt = this.getYT();
    yt.ensurePlayer();
    // Stop the audio-element path.
    for (const el of this.els) {
      el.pause();
      el.src = "";
    }
    const wasPlaying = this.kind === "youtube" && this.playing;
    this.kind = "youtube";
    this.lastYtDuration = 0;
    const targetVol = this.muted ? 0 : this.volume;
    yt.setPlaybackRate(this.rate);
    const doLoad = () => {
      yt.loadVideo(track.sourceId!, autoplay);
      if (autoplay) yt.fadeVolume(targetVol, 0.6);
    };
    // YouTube crossfade: fade the old video out, switch, fade the new one in.
    if (crossfade && wasPlaying && this.crossfadeSec > 0) {
      yt.fadeVolume(0, Math.min(this.crossfadeSec, 3), doLoad);
    } else {
      yt.setVolume(targetVol);
      doLoad();
    }
    this.startYtPoll();
  }

  private loadAudio(track: TrackDTO, autoplay: boolean, crossfade: boolean) {
    this.stopYtPoll();
    if (this.yt) this.yt.pause();
    this.kind = "audio";

    const next = 1 - this.active;
    const el = this.els[next];
    const prevEl = this.els[this.active];
    const prevGain = this.elGains[this.active];
    const nextGain = this.elGains[next];
    const wasPlaying = !prevEl.paused && prevEl.src !== "";
    const xf = crossfade && wasPlaying && this.crossfadeSec > 0 ? this.crossfadeSec : 0;

    el.src = track.streamUrl;
    el.playbackRate = this.rate;
    el.currentTime = 0;

    if (autoplay) {
      if (xf > 0) {
        nextGain.gain.cancelScheduledValues(this.ctx!.currentTime);
        nextGain.gain.setValueAtTime(0.0001, this.ctx!.currentTime);
        const t = this.ctx!.currentTime;
        const vol = this.muted ? 0 : this.volume;
        nextGain.gain.exponentialRampToValueAtTime(Math.max(vol * this.normGain, 0.0001), t + xf);
        prevGain.gain.cancelScheduledValues(t);
        prevGain.gain.setValueAtTime(Math.max(prevGain.gain.value, 0.0001), t);
        prevGain.gain.exponentialRampToValueAtTime(0.0001, t + xf);
        this.crossfadeTimer = setTimeout(() => {
          prevEl.pause();
          prevEl.src = "";
          prevGain.gain.setValueAtTime(0.0001, this.ctx!.currentTime);
        }, xf * 1000 + 60);
      } else {
        nextGain.gain.setTargetAtTime(
          this.muted ? 0 : this.volume * this.normGain,
          this.ctx!.currentTime,
          0.02,
        );
        prevEl.pause();
        prevEl.src = "";
      }
      void el.play().catch((err: unknown) => {
        this.emit("error", err instanceof Error ? err.message : "autoplay blocked");
      });
    } else {
      nextGain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.02);
    }
    this.active = next;
  }

  /** Pre-buffer the next track into the idle element (gapless, audio path only). */
  preload(url: string) {
    if (!this.ctx || this.kind !== "audio") return;
    const idle = this.els[1 - this.active];
    if (idle.src !== url) {
      idle.src = url;
      idle.load();
    }
  }

  async play(): Promise<void> {
    this.ensureContext();
    if (this.kind === "youtube" && this.yt) {
      this.yt.play();
      return;
    }
    const el = this.els[this.active];
    if (!el.src) return;
    try {
      await el.play();
    } catch (err) {
      this.emit("error", err instanceof Error ? err.message : "play failed");
    }
  }

  pause() {
    if (this.kind === "youtube" && this.yt) {
      this.yt.pause();
      return;
    }
    const el = this.els[this.active];
    el.pause();
  }

  /** Hard stop: pause + release the source (works for live radio/TV streams). */
  stop() {
    this.stopYtPoll();
    if (this.yt) this.yt.pause();
    for (const el of this.els) {
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
    }
    this.loadedTrackKey = null;
    this.current = null;
    this.emit("pause");
  }

  toggle(): Promise<void> {
    if (this.kind === "youtube" && this.yt) {
      if (this.yt.getState() === YT.PlayerState.PLAYING) this.yt.pause();
      else this.yt.play();
      return Promise.resolve();
    }
    const el = this.els[this.active];
    if (!el.src) return Promise.resolve();
    if (el.paused) return this.play();
    this.pause();
    return Promise.resolve();
  }

  seek(sec: number) {
    if (this.kind === "youtube" && this.yt) {
      this.yt.seekTo(sec);
      return;
    }
    const el = this.els[this.active];
    if (!el.src) return;
    try {
      el.currentTime = clamp(sec, 0, Number.isFinite(el.duration) ? el.duration : sec);
    } catch {
      /* metadata not ready yet */
    }
  }

  get position(): number {
    if (this.kind === "youtube" && this.yt) return this.yt.getCurrentTime();
    return this.els[this.active]?.currentTime ?? 0;
  }

  get duration(): number {
    if (this.kind === "youtube" && this.yt) return this.yt.getDuration();
    const d = this.els[this.active]?.duration;
    return Number.isFinite(d) ? (d as number) : 0;
  }

  get playing(): boolean {
    if (this.kind === "youtube" && this.yt) {
      return this.yt.getState() === YT.PlayerState.PLAYING;
    }
    const el = this.els[this.active];
    return !!el && !el.paused && !el.ended;
  }

  /* ------------------------- YouTube time polling ----------------------- */

  private startYtPoll() {
    this.stopYtPoll();
    this.ytPoll = setInterval(() => {
      if (this.kind !== "youtube" || !this.yt) return;
      this.emit("timeupdate", this.yt.getCurrentTime());
      const d = this.yt.getDuration();
      if (d > 0 && Math.abs(d - this.lastYtDuration) > 0.5) {
        this.lastYtDuration = d;
        this.emit("durationchange", d);
      }
    }, 400);
  }

  private stopYtPoll() {
    if (this.ytPoll) clearInterval(this.ytPoll);
    this.ytPoll = null;
  }

  /* ---------------------------- sleep timer ---------------------------- */

  /** Fade out over `fadeSec` then pause at `endsAt` epoch ms. */
  startSleepTimer(endsAt: number, fadeSec = 30) {
    this.cancelSleepTimer();
    const ms = endsAt - Date.now();
    if (ms <= 0) {
      this.pause();
      return;
    }
    const ctx = this.ensureContext();
    const master = this.master!;
    const fadeStart = Math.max(0, ms - fadeSec * 1000);
    this.sleepTimer = setTimeout(() => {
      const base = this.muted ? 0 : this.volume * this.normGain;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(base, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
      if (this.kind === "youtube" && this.yt) this.yt.setVolume(0);
      this.sleepFadeTimer = setTimeout(() => {
        this.pause();
        this.applyVolume();
        if (this.kind === "youtube" && this.yt) this.yt.setVolume(this.muted ? 0 : this.volume);
        this.emit("pause");
      }, fadeSec * 1000 + 100);
    }, fadeStart);
  }

  cancelSleepTimer() {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    if (this.sleepFadeTimer) clearTimeout(this.sleepFadeTimer);
    this.sleepTimer = null;
    this.sleepFadeTimer = null;
    if (this.ctx && this.master) this.applyVolume();
    if (this.kind === "youtube" && this.yt) this.yt.setVolume(this.muted ? 0 : this.volume);
  }

  /* ----------------------------- visualizer ---------------------------- */

  /** AnalyserNode for the real-time spectrum visualizer (audio path only). */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getFrequencyData(arr: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(arr);
    return true;
  }

  getTimeDomainData(arr: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(arr);
    return true;
  }
}

/** Process-wide singleton — one engine per browser tab. */
let engine: UniversalPlaybackEngine | null = null;

export function getEngine(): UniversalPlaybackEngine {
  if (typeof window === "undefined") {
    return new UniversalPlaybackEngine();
  }
  if (!engine) engine = new UniversalPlaybackEngine();
  return engine;
}
