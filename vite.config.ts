import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || (mode === "android" ? "./" : "/"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: r("src/compat/link.tsx") },
      { find: /^next\/navigation$/, replacement: r("src/compat/navigation.tsx") },
      { find: /^next\/image$/, replacement: r("src/compat/image.tsx") },
      { find: /^@\//, replacement: r("src/") },
    ],
  },
  server: { host: "0.0.0.0", port: 3000, allowedHosts: [".e2b.app"] },
  preview: { host: "0.0.0.0", port: 3000, allowedHosts: [".e2b.app"] },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          hls: ["hls.js"],
        },
      },
    },
  },
}));
