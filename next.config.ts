import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production bundle: .next/standalone contains the server +
  // only the node_modules it actually needs. scripts/bundle.mjs copies it into
  // dist/donmuse together with public/, static chunks, yt-dlp, ffmpeg, PGlite.
  output: "standalone",
  serverExternalPackages: ["ffmpeg-static", "youtubei.js", "bgutils-js", "@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./bin/**", "./node_modules/ffmpeg-static/**", "./node_modules/@electric-sql/pglite/dist/**"],
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json" }] },
    ];
  },
};

export default nextConfig;
