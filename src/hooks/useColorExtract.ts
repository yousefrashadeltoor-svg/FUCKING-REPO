
// Extracts dominant colors from an album art image via a tiny canvas sample,
// and sets the --dynamic-* CSS variables that drive the ambient background.
import { useEffect } from "react";

export function extractColors(url: string | null | undefined): Promise<{ primary: string; secondary: string; glow: string } | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let r = 0, g = 0, b = 0, n = 0;
        // sample every 4th pixel, skip near-black pixels (background)
        for (let i = 0; i < data.length; i += 16) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2];
          if (pr + pg + pb < 90) continue;
          r += pr; g += pg; b += pb; n++;
        }
        if (n === 0) return resolve(null);
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        const primary = `rgb(${r},${g},${b})`;
        const secondary = `rgb(${Math.round(r * 0.55 + 40)},${Math.round(g * 0.55 + 30)},${Math.round(b * 0.75 + 60)})`;
        resolve({
          primary,
          secondary,
          glow: `rgba(${r},${g},${b},0.28)`,
        });
      } catch {
        resolve(null); // tainted canvas (CORS) — keep current theme
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useColorExtract(url: string | null | undefined) {
  useEffect(() => {
    let cancelled = false;
    void extractColors(url).then((colors) => {
      if (cancelled || !colors) return;
      const root = document.documentElement;
      root.style.setProperty("--dynamic-primary", colors.primary);
      root.style.setProperty("--dynamic-secondary", colors.secondary);
      root.style.setProperty("--dynamic-glow", colors.glow);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
}
