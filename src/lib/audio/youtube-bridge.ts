// ============================================================================
//  YouTubeBridge — full-length YouTube Music playback via the YouTube IFrame
//  Player API. The player lives in a hidden 1x1 iframe; all control is
//  programmatic (play / pause / seek / volume / rate / time polling).
// ============================================================================

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Cmd = () => void;

export class YouTubeBridge {
  private player: YT.Player | null = null;
  private ready = false;
  private pending: Cmd[] = [];
  private volume = 80;
  private rate = 1;
  private videoId: string | null = null;

  onStateChange: (state: number) => void = () => {};
  onError: (code: number) => void = () => {};
  onReady: () => void = () => {};

  /** Create the hidden player (idempotent). Must be called from a gesture at least once. */
  ensurePlayer(): void {
    if (this.player) return;
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    }
    const create = () => {
      if (this.player || !window.YT) return;
      const div = document.createElement("div");
      div.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
      div.setAttribute("aria-hidden", "true");
      document.body.appendChild(div);
      this.player = new window.YT.Player(div, {
        width: 1,
        height: 1,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            this.ready = true;
            this.player?.setVolume(this.volume);
            this.player?.setPlaybackRate(this.rate);
            const cmds = this.pending;
            this.pending = [];
            for (const c of cmds) c();
            this.onReady();
          },
          onStateChange: (e: YT.OnStateChangeEvent) => this.onStateChange(e.data),
          onError: (e: YT.OnErrorEvent) => this.onError(e.data),
        },
      });
    };
    if (window.YT?.Player) {
      create();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        create();
      };
    }
  }

  private run(cmd: Cmd) {
    if (this.ready && this.player) cmd();
    else this.pending.push(cmd);
  }

  loadVideo(videoId: string, autoplay = true) {
    this.videoId = videoId;
    this.run(() => {
      if (!this.player) return;
      if (autoplay) this.player.loadVideoById(videoId);
      else this.player.cueVideoById(videoId);
    });
  }

  play() {
    this.run(() => this.player?.playVideo());
  }

  pause() {
    this.run(() => this.player?.pauseVideo());
  }

  seekTo(sec: number) {
    this.run(() => {
      try {
        this.player?.seekTo(Math.max(0, sec), true);
      } catch {
        /* not ready */
      }
    });
  }

  setVolume(v: number) {
    this.volume = Math.round(Math.min(1, Math.max(0, v)) * 100);
    this.run(() => this.player?.setVolume(this.volume));
  }

  setPlaybackRate(r: number) {
    this.rate = Math.min(3, Math.max(0.25, r));
    this.run(() => this.player?.setPlaybackRate(this.rate));
  }

  /** YouTube playback quality: 'auto' | 'small' | 'medium' | 'hd720' | 'hd1080' | 'hd2160' */
  setPlaybackQuality(q: YT.SuggestedVideoQuality) {
    this.run(() => {
      try {
        this.player?.setPlaybackQuality(q);
      } catch {
        /* quality not available for this video */
      }
    });
  }

  /** Smoothly ramp the player volume (used for YouTube crossfades). */
  fadeVolume(to: number, seconds: number, onDone?: () => void) {
    const target = Math.round(Math.min(1, Math.max(0, to)) * 100);
    const steps = Math.max(1, Math.round(seconds * 10));
    const from = this.volume;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      const v = Math.round(from + ((target - from) * i) / steps);
      this.volume = v;
      try {
        this.player?.setVolume(v);
      } catch {
        /* noop */
      }
      if (i >= steps) {
        clearInterval(iv);
        onDone?.();
      }
    }, 100);
  }

  getCurrentTime(): number {
    try {
      return this.player?.getCurrentTime() ?? 0;
    } catch {
      return 0;
    }
  }

  getDuration(): number {
    try {
      const d = this.player?.getDuration() ?? 0;
      return Number.isFinite(d) ? d : 0;
    } catch {
      return 0;
    }
  }

  getState(): number {
    try {
      return this.player?.getPlayerState() ?? -1;
    } catch {
      return -1;
    }
  }

  get loadedVideoId(): string | null {
    return this.videoId;
  }
}
