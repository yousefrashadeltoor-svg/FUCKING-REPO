import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "DON MUSE — YouTube Music, Live Radio, Lossless Downloads",
    template: "%s · DON MUSE",
  },
  description:
    "DON MUSE: real full-length music from YouTube Music, Audius, SoundCloud and the Internet Archive — live Egyptian radio with a clip recorder, AI playlists, and downloads in every quality with cover art.",
  icons: { icon: [{ url: "/favicon.png", sizes: "32x32" }, { url: "/logo.png", sizes: "512x512" }], apple: "/logo.png" },
  manifest: "/manifest.webmanifest",
  applicationName: "DON MUSE",
};

export const viewport: Viewport = {
  themeColor: "#030304",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-void font-body text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
