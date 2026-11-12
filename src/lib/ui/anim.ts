
// ============================================================================
//  DON MUSE — motion runtime
//  ---------------------------------------------------------------------------
//  A single requestAnimationFrame scheduler shared by every animated element
//  (visualizer, drag-to-dismiss, smooth scrolling, transitions). One loop =
//  fewer layout thrash points and a frame budget that adapts to the device,
//  which is how we hold 120–240 fps on capable screens without wasting CPU on
//  weak ones.
// ============================================================================

type Sub = (now: number, dt: number) => void;

const subs = new Set<Sub>();
let raf = 0;
let last = 0;
let fps = 60;
let frames = 0;
let fpsWindowStart = 0;

function loop(now: number) {
  if (subs.size === 0) {
    raf = 0;
    return;
  }
  const dt = last ? Math.min(64, now - last) : 16.7;
  last = now;
  for (const sub of subs) {
    try {
      sub(now, dt);
    } catch {
      /* never let one subscriber kill the loop */
    }
  }
  frames++;
  if (now - fpsWindowStart >= 500) {
    fps = Math.round((frames * 1000) / (now - fpsWindowStart));
    frames = 0;
    fpsWindowStart = now;
  }
  raf = requestAnimationFrame(loop);
}

/** Subscribe to the shared frame loop. Returns an unsubscribe function. */
export function onFrame(sub: Sub): () => void {
  if (typeof window === "undefined") return () => {};
  subs.add(sub);
  if (!raf) {
    last = 0;
    fpsWindowStart = performance.now();
    frames = 0;
    raf = requestAnimationFrame(loop);
  }
  return () => {
    subs.delete(sub);
    if (subs.size === 0 && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

export function currentFps(): number {
  return fps;
}

/** Hint the compositor that a heavy animation is about to start. */
export function enterPlayerMode(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.playerMode = "on";
}

export function exitPlayerMode(): void {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.playerMode;
}

export const SPRING = {
  soft: { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.9 },
  snappy: { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.7 },
  gentle: { type: "spring" as const, stiffness: 180, damping: 26 },
  page: { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.8 },
};

/** Shared page-transition variants — one direction, no left→right glitch. */
export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 10, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -6, filter: "blur(4px)" },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
};

/** Momentum-free smoothing helper (exponential, frame-rate independent). */
export function smoothTowards(current: number, target: number, dt: number, halfLifeMs = 90): number {
  const k = Math.pow(0.5, dt / halfLifeMs);
  return target + (current - target) * k;
}
