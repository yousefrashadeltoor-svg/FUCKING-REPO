
// Real-time spectrum analyzer driven by the engine's AnalyserNode (Web Audio FFT).
import { useEffect, useRef } from "react";
import { getEngine } from "@/lib/audio/engine";

export function SpectrumVisualizer({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const engine = getEngine();
    let raf = 0;
    const data = new Uint8Array(1024);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const hasSignal = engine.getFrequencyData(data);
      const silent = !hasSignal || data.every((v) => v === 0);
      if (silent) {
        // YouTube playback (iframe audio bypasses WebAudio) or engine idle —
        // draw animated bars driven by the clock.
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, "#1DB954");
        grad.addColorStop(0.5, "#00D4FF");
        grad.addColorStop(1, "#FA2D55");
        ctx.fillStyle = grad;
        const bars = 56;
        const t = Date.now() / 450;
        for (let i = 0; i < bars; i++) {
          const bh = 6 + Math.abs(Math.sin(i * 0.55 + t) * Math.cos(i * 0.21 + t * 0.7)) * (h - 24);
          const bw = w / bars - 3;
          ctx.beginPath();
          ctx.roundRect(i * (w / bars) + 1.5, h - bh, bw, bh, 3);
          ctx.fill();
        }
        return;
      }
      const bars = 56;
      const step = Math.floor(data.length / 2 / bars);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, "#1DB954");
      grad.addColorStop(0.5, "#00D4FF");
      grad.addColorStop(1, "#FA2D55");
      ctx.fillStyle = grad;
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] ?? 0;
        const bh = (v / 255) * (h - 8) + 2;
        const bw = w / bars - 3;
        const x = i * (w / bars) + 1.5;
        const y = h - bh;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 3);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={560}
      height={180}
      className={className ?? "h-40 w-full rounded-xl bg-white/[0.03]"}
    />
  );
}
