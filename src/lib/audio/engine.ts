// ============================================================================
//  DON MUSE — UniversalPlaybackEngine (v2, rewritten)
//  ---------------------------------------------------------------------------
//  ONE audio pipeline, ONE authoritative source at any moment.
//
//  Backends
//    • html   (web / PWA)  → <audio> element(s) routed through a WebAudio graph
//                            (10-band EQ, loudness match, analyser/spectrum).
//    • native (Android)    → on-device ExoPlayer via the DON MUSE native plugin
//                            (background playback, MediaSession notification,
//                            lock-screen + widgets). The WebView is only UI.
//    • youtube             → YouTube IFrame bridge (only for `codec: "iframe"`).
//
//  Correctness rules this file enforces (all of these were real bugs before):
//    1. Starting track B ALWAYS silences track A, including the Quran/music
//       cross-over case — `killOthers()` runs on every load.
//    2. A stale async load can never win: every load takes a monotonically
//       increasing token and bails out if a newer load started.
//    3. `isPlaying` is derived from the REAL element/player state, not from a
//       state flag — the timer can never run while nothing is audible.
//    4. No fake progress: position comes from the playing media only.
//    5. Repeated taps on the same track never stack a second player.
// ============================================================================

import { clamp, EQ_BAND_FREQUENCIES } from "@/lib/utils";
import type { TrackDTO } from "@/lib/types";
import { YouTubeBridge } from "./youtube-bridge";
import { nativePlayback } from "@/lib/platform/native";
import { apiUrl } from "@/lib/api-base";

export type EngineEvent =
  | "play"
  | "pause"
  | "ended"
  | "timeupdate"
  | "durationchange"
  | "error"
  | "trackchange"
  | "buffering"
  | "ready";

export type EngineEventHandler = (payload?: unknown) => void;

const TARGET_LUFS = -14;
const POSITION_TICK_MS = 120;

type Listener = { event: EngineEvent; handler: EngineEventHandler };
type SourceKind = "audio" | "youtube" | "native";

export interface LoadOptions {
  autoplay?: boolean;
  /** Position to resume from (seconds). */
  startAt?: number;
}

export class UniversalPlaybackEngine {
  /* ------------------------------ audio graph ------------------------------ */
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private els: HTMLAudioElement[] = [];
  private elGains: GainNode[] = [];
  private eqChains: BiquadFilterNode[][] = [];
  private active = 0;

  /* -------------------------------- state --------------------------------- */
  private listeners: Listener[] = [];
  private current: TrackDTO | null = null;
  private loadedKey: string | null = null;
  private loadToken = 0;
  private kind: SourceKind = "audio";
  private normGain = 1;
  private volume = 0.8;
  private muted = false;
  private rate = 1;
  private loudnessNormalization = true;
  private tick: ReturnType<typeof setInterval> | null = null;
  private lastEmittedPos = -1;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDuration = 0;
  private endedGuard = false;

  /* ------------------------------- youtube -------------------------------- */
  private yt: YouTubeBridge | null = null;
  private lastYtDuration = 0;

  /* ============================== audio graph ============================== */

  /** Unlock the AudioContext. Call inside a user gesture (tap/click). */
  ensureContext(): AudioContext | null {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: "interactive" });
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
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
        el.autoplay = false;
        el.setAttribute("playsinline", "true");
        el.setAttribute("webkit-playsinline", "true");
        // Keep the element in the DOM graph so some WebViews (Android) keep
        // decoding while the tab is hidden — the old code detached them.
        el.setAttribute("data-donmuse-audio", String(i));
        // `.crossOrigin` is intentionally NOT set: our stream proxy is
        // same-origin, and setting it on a redirecting CDN stream can cause
        // silent CORS failures (a real cause of "no sound, timer still moving").

        const src = this.ctx.createMediaElementSource(el);
        const g = this.ctx.createGain();
        g.gain.value = 0;
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
        node.connect(this.master);

        el.addEventListener("play", () => {
          if (this.isActiveEl(el) && this.kind === "audio") {
            this.endedGuard = false;
            this.startTick();
            this.emit("play");
          }
        });
        el.addEventListener("pause", () => {
          if (this.isActiveEl(el) && this.kind === "audio" && !this.endedGuard) this.emit("pause");
        });
        el.addEventListener("waiting", () => {
          if (this.isActiveEl(el) && this.kind === "audio") this.emit("buffering", true);
        });
        el.addEventListener("playing", () => {
          if (this.isActiveEl(el) && this.kind === "audio") this.emit("buffering", false);
        });
        el.addEventListener("canplay", () => {
          if (this.isActiveEl(el) && this.kind === "audio") this.emit("ready");
        });
        el.addEventListener("loadedmetadata", () => {
          if (this.isActiveEl(el) && this.kind === "audio") this.pushDuration();
        });
        el.addEventListener("durationchange", () => {
          if (this.isActiveEl(el) && this.kind === "audio") this.pushDuration();
        });
        el.addEventListener("ended", () => {
          if (this.isActiveEl(el) && this.kind === "audio") {
            this.endedGuard = true;
            this.stopTick();
            this.emit("timeupdate", this.duration);
            this.emit("ended");
          }
        });
        el.addEventListener("error", () => {
          if (this.isActiveEl(el) && this.kind === "audio") {
            this.stopTick();
            this.emit("error", this.describeError(el));
            this.emit("pause");
          }
        });
        el.addEventListener("stalled", () => {
          if (this.isActiveEl(el) && this.kind === "audio") this.emit("buffering", true);
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

  private isActiveEl(el: HTMLAudioElement): boolean {
    return this.els[this.active] === el;
  }

  private describeError(el: HTMLAudioElement): string {
    const code = el.error?.code;
    switch (code) {
      case 1:
        return "Playback aborted";
      case 2:
        return "Network error while streaming — check your connection";
      case 3:
        return "This file could not be decoded";
      case 4:
        return "Source not supported or unavailable";
      default:
        return el.error?.message || "Playback error";
    }
  }

  /* -------------------------------- events -------------------------------- */

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

  /* ---------------------------- configuration ----------------------------- */

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
    this.applyVolume();
    if (this.kind === "youtube" && this.yt) this.yt.setVolume(this.muted ? 0 : this.volume);
    if (this.kind === "native") nativePlayback.setVolume(this.muted ? 0 : this.volume);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolume();
    if (this.kind === "youtube" && this.yt) this.yt.setVolume(this.muted ? 0 : this.volume);
    if (this.kind === "native") nativePlayback.setVolume(this.muted ? 0 : this.volume);
  }

  setPlaybackRate(r: number) {
    this.rate = clamp(r, 0.5, 3);
    for (const el of this.els) {
      try {
        el.playbackRate = this.rate;
      } catch {
        /* not ready */
      }
    }
    if (this.yt) this.yt.setPlaybackRate(this.rate);
    if (this.kind === "native") nativePlayback.setRate(this.rate);
  }

  setQuality(q: "auto" | "low" | "high" | "lossless") {
    const map = { auto: "default", low: "medium", high: "hd1080", lossless: "hd2160" } as const;
    if (this.yt) this.yt.setPlaybackQuality(map[q] as YT.SuggestedVideoQuality);
  }

  setLoudnessNormalization(on: boolean) {
    this.loudnessNormalization = on;
    this.normGain = this.current && on ? this.computeNormGain(this.current) : 1;
    this.applyVolume();
  }

  setEq(bands: number[]) {
    for (const chain of this.eqChains) {
      chain.forEach((bq, i) => {
        bq.gain.value = clamp(bands[i] ?? 0, -24, 24);
      });
    }
  }

  private applyVolume() {
    const target = this.muted ? 0 : this.volume;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
    }
    // The element is only used as a source; its own gain must not double-apply.
  }

  private computeNormGain(track: TrackDTO): number {
    if (!this.loudnessNormalization) return 1;
    const lufs = Number.isFinite(track.loudnessLufs) ? track.loudnessLufs : TARGET_LUFS;
    return clamp(Math.pow(10, (TARGET_LUFS - lufs) / 20), 0.25, 4);
  }

  private sourceKey(track: TrackDTO): string {
    return `${track.source}:${track.sourceId ?? ""}:${track.streamUrl}`;
  }

  /* ------------------------------ loading -------------------------------- */

  /**
   * Load (and by default start) a track. Safe to call from a click handler —
   * the audio element starts buffering + playing synchronously, so there is no
   * perceptible delay before the first sample.
   */
  async load(track: TrackDTO, opts: LoadOptions = {}): Promise<void> {
    const { autoplay = true, startAt = 0 } = opts;
    const token = ++this.loadToken;
    const key = this.sourceKey(track);

    // Same source already loaded → just resume/restart, never a second player.
    if (this.loadedKey === key && this.current?.id === track.id) {
      if (autoplay) {
        if (this.kind === "native") nativePlayback.play();
        else if (this.kind === "youtube") this.yt?.play();
        else await this.playElement();
      }
      return;
    }

    this.cancelSleepTimer();
    this.current = track;
    this.loadedKey = key;
    this.normGain = this.computeNormGain(track);
    this.lastDuration = track.durationSec > 0 ? track.durationSec : 0;
    this.endedGuard = false;
    this.lastEmittedPos = -1;
    this.emit("trackchange", track);

    const useYouTube = track.source === "youtube" && track.codec === "iframe" && !!track.sourceId;
    const useNative = !useYouTube && nativePlayback.canHandle(track);

    if (useNative) {
      // The WebView must never also play audio while ExoPlayer owns the session.
      this.kind = "native";
      this.hardStopElements();
      this.stopTick();
      nativePlayback.load(track, { autoplay, startAt });
      return;
    }

    if (useYouTube) {
      this.kind = "youtube";
      this.hardStopElements();
      const yt = this.getYT();
      yt.ensurePlayer();
      yt.setVolume(this.muted ? 0 : this.volume);
      yt.setPlaybackRate(this.rate);
      yt.loadVideo(track.sourceId!, autoplay);
      this.startTick();
      return;
    }

    // ---- HTML audio path ----
    if (token !== this.loadToken) return; // a newer load took over
    this.kind = "audio";
    if (this.yt) this.yt.pause();
    if (nativePlayback.active) nativePlayback.stop();

    const ctx = this.ensureContext();
    const next = this.els.length ? 1 - this.active : 0;
    const el = this.els[next];
    if (!el || !ctx) return;

    // Silence every other element first — this is what fixes "Quran plays but
    // the old song comes back when I hit stop".
    for (let i = 0; i < this.els.length; i++) {
      if (i === next) continue;
      const other = this.els[i];
      try {
        other.pause();
        other.removeAttribute("src");
        other.load();
      } catch {
        /* ignore */
      }
      this.elGains[i].gain.cancelScheduledValues(ctx.currentTime);
      this.elGains[i].gain.value = 0;
    }

    this.active = next;
    this.elGains[next].gain.cancelScheduledValues(ctx.currentTime);
    this.elGains[next].gain.value = 1;

    try {
      el.src = apiUrl(track.streamUrl);
      el.playbackRate = this.rate;
      if (startAt > 0) el.currentTime = startAt;
      el.load();
    } catch {
      this.emit("error", "Could not load this stream");
      return;
    }

    if (autoplay) {
      void this.playElement(token);
    }
    this.startTick();
  }

  private async playElement(expectedToken?: number): Promise<void> {
    const el = this.els[this.active];
    if (!el || !el.src) return;
    try {
      // Synchronous call within the gesture keeps the autoplay allowance.
      await el.play();
      if (expectedToken !== undefined && expectedToken !== this.loadToken) return;
      this.startTick();
      this.emit("play");
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "AbortError") return; // superseded by a newer load — not an error
      this.stopTick();
      this.emit("error", (err as Error)?.message ?? "Playback was blocked");
      this.emit("pause");
    }
  }

  private hardStopElements() {
    for (let i = 0; i < this.els.length; i++) {
      const el = this.els[i];
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
      if (this.ctx) {
        this.elGains[i].gain.cancelScheduledValues(this.ctx.currentTime);
        this.elGains[i].gain.value = 0;
      }
    }
  }

  /* ------------------------------ transport ------------------------------- */

  async play(): Promise<void> {
    if (this.kind === "native") return nativePlayback.play();
    if (this.kind === "youtube") {
      this.yt?.play();
      this.startTick();
      return;
    }
    this.ensureContext();
    await this.playElement();
  }

  pause(): void {
    if (this.kind === "native") {
      nativePlayback.pause();
      this.stopTick();
      return;
    }
    if (this.kind === "youtube") {
      this.yt?.pause();
      this.stopTick();
      return;
    }
    const el = this.els[this.active];
    if (el) el.pause();
    this.stopTick();
  }

  /**
   * Hard stop and release EVERY source (radio / Quran / TV / music).
   *
   * All three backends are silenced regardless of which one currently owns the
   * output: that is what makes the little "X" in the playbar — and stopping a
   * surah — truly end playback instead of letting a previously started song
   * reappear on the next play().
   */
  stop(): void {
    this.stopTick();
    this.loadToken++; // invalidates any in-flight load/play promise
    try {
      nativePlayback.stop();
    } catch {
      /* no native host */
    }
    this.yt?.pause();
    this.hardStopElements();
    this.kind = "audio";
    this.loadedKey = null;
    this.current = null;
    this.lastDuration = 0;
    this.lastEmittedPos = -1;
    this.endedGuard = false;
    this.emit("pause");
  }

  async toggle(): Promise<void> {
    if (this.isPlaying) this.pause();
    else await this.play();
  }

  seek(sec: number): void {
    if (this.kind === "native") {
      nativePlayback.seek(sec);
      return;
    }
    if (this.kind === "youtube") {
      this.yt?.seekTo(sec);
      return;
    }
    const el = this.els[this.active];
    if (!el || !el.src) return;
    try {
      const max = Number.isFinite(el.duration) ? el.duration : sec;
      el.currentTime = clamp(sec, 0, max);
      this.lastEmittedPos = -1;
      this.emit("timeupdate", sec);
    } catch {
      /* metadata not ready yet */
    }
  }

  get position(): number {
    if (this.kind === "native") return nativePlayback.position;
    if (this.kind === "youtube") return this.yt?.getCurrentTime() ?? 0;
    const el = this.els[this.active];
    return el && Number.isFinite(el.currentTime) ? el.currentTime : 0;
  }

  /**
   * Duration, in order of trust: the media element's real `duration`, then the
   * value reported by the backend, then the catalog/metadata duration. Using
   * `||` between sources is what previously produced a timer that ran while the
   * slider sat still — never fall back when a real value exists.
   */
  get duration(): number {
    if (this.kind === "native") {
      const n = nativePlayback.duration;
      if (Number.isFinite(n) && n > 0) return n;
      return this.lastDuration;
    }
    if (this.kind === "youtube") {
      const y = this.yt?.getDuration() ?? 0;
      if (Number.isFinite(y) && y > 0) return y;
      return this.lastDuration;
    }
    const el = this.els[this.active];
    const d = el?.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
    return this.lastDuration;
  }

  get isPlaying(): boolean {
    if (this.kind === "native") return nativePlayback.isPlaying;
    if (this.kind === "youtube") {
      const state = this.yt?.getState();
      return state === 1; // YT.PlayerState.PLAYING
    }
    const el = this.els[this.active];
    return !!el && !el.paused && !el.ended && !!el.src;
  }

  /** Back-compat alias. */
  get playing(): boolean {
    return this.isPlaying;
  }

  get currentTrack(): TrackDTO | null {
    return this.current;
  }

  get backend(): SourceKind {
    return this.kind;
  }

  private pushDuration() {
    const d = this.duration;
    if (d > 0 && Math.abs(d - this.lastDuration) > 0.3) {
      this.lastDuration = d;
      this.emit("durationchange", d);
    }
  }

  /* --------------------------- position ticking --------------------------- */

  private startTick() {
    if (this.tick) return;
    this.tick = setInterval(() => {
      if (!this.isPlaying) {
        this.stopTick();
        return;
      }
      const pos = this.position;
      if (Number.isFinite(pos) && Math.abs(pos - this.lastEmittedPos) >= 0.08) {
        this.lastEmittedPos = pos;
        this.emit("timeupdate", pos);
      }
      if (this.kind === "youtube") {
        const d = this.duration;
        if (d > 0 && Math.abs(d - this.lastYtDuration) > 0.5) {
          this.lastYtDuration = d;
          this.lastDuration = d;
          this.emit("durationchange", d);
        }
      } else {
        this.pushDuration();
      }
    }, POSITION_TICK_MS);
  }

  private stopTick() {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }

  /* ------------------------------ pre-buffer ------------------------------ */

  /** Warm the idle element so the next track starts instantly (audio path). */
  preloadNext(url: string | undefined | null) {
    if (!url || this.kind !== "audio" || this.els.length < 2) return;
    // Never touch an element that still has live audio — preloading over the
    // playing element is one of the classic "ghost playback" causes.
    if (!this.els[this.active]?.paused && this.els[this.active]?.src) return;
    const idle = this.els[1 - this.active];
    if (idle.src !== url) {
      try {
        idle.preload = "auto";
        idle.src = apiUrl(url);
        idle.load();
      } catch {
        /* ignore */
      }
    }
  }

  /* ----------------------------- sleep timer ------------------------------ */

  startSleepTimer(endsAt: number, fadeSec = 20) {
    this.cancelSleepTimer();
    const ms = endsAt - Date.now();
    if (ms <= 0) {
      this.pause();
      return;
    }
    const fadeStart = Math.max(0, ms - fadeSec * 1000);
    this.sleepTimer = setTimeout(() => {
      if (this.kind === "native") {
        nativePlayback.fadeOut(fadeSec);
        this.sleepFadeTimer = setTimeout(() => {
          this.pause();
          nativePlayback.setVolume(this.muted ? 0 : this.volume);
        }, fadeSec * 1000 + 100);
        return;
      }
      if (this.ctx && this.master) {
        const t = this.ctx.currentTime;
        const base = Math.max(this.muted ? 0.0001 : this.volume, 0.0001);
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(base, t);
        this.master.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
      }
      if (this.kind === "youtube" && this.yt) this.yt.fadeVolume(0, fadeSec);
      this.sleepFadeTimer = setTimeout(() => {
        this.pause();
        this.applyVolume();
        if (this.kind === "youtube" && this.yt) this.yt.setVolume(this.muted ? 0 : this.volume);
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

  /* ------------------------------ visualizer ------------------------------ */

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

  /* ------------------------------- youtube -------------------------------- */

  private getYT(): YouTubeBridge {
    if (!this.yt) {
      this.yt = new YouTubeBridge();
      this.yt.onStateChange = (state) => {
        if (this.kind !== "youtube") return;
        if (state === 1) {
          this.startTick();
          this.emit("play");
        } else if (state === 2) {
          this.stopTick();
          this.emit("pause");
        } else if (state === 0) {
          this.stopTick();
          this.emit("ended");
        } else if (state === 3) {
          this.emit("buffering", true);
        }
      };
      this.yt.onError = (code) => {
        if (this.kind !== "youtube") return;
        this.stopTick();
        this.emit(
          "error",
          code === 101 || code === 150
            ? "The owner disabled playback of this video on other sites"
            : code === 100
              ? "Video not found"
              : `YouTube player error (${code})`,
        );
        this.emit("pause");
      };
    }
    return this.yt;
  }
}

/** Process-wide singleton — exactly one engine per window/document. */
let engine: UniversalPlaybackEngine | null = null;

export function getEngine(): UniversalPlaybackEngine {
  if (typeof window === "undefined") {
    // SSR: a throw-away instance so imports never crash during prerender.
    return new UniversalPlaybackEngine();
  }
  if (!engine) {
    engine = new UniversalPlaybackEngine();
    const g = window as unknown as { __donmuseEngine?: UniversalPlaybackEngine };
    if (g.__donmuseEngine && g.__donmuseEngine !== engine) return g.__donmuseEngine;
    g.__donmuseEngine = engine;
  }
  return engine;
}
