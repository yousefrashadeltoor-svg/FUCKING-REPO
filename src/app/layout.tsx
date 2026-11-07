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
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: "/logo-dark.svg",
  },
  manifest: "/manifest.webmanifest",
  applicationName: "DON MUSE",
  themeColor: "#05060a",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DON MUSE" },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

/**
 * Paint-time theme bootstrap.
 *
 * Reads the persisted theme from localStorage (web) or the native store (the
 * Android host injects it as `window.__dmTheme`) *before* React hydrates, so
 * there is never a white flash or a wrong-theme frame on load — the "page
 * flashes" problem the user reported.
 */
const bootstrap = `
(function(){
  try {
    var d = document.documentElement;
    var raw = window.__dmTheme;
    if (!raw) { try { raw = localStorage.getItem('dm:aura-settings') || localStorage.getItem('aura-settings'); } catch(e){} }
    var st = null;
    if (raw) { try { var p = JSON.parse(raw); st = p && p.state ? p.state : p; } catch(e){} }
    var theme = (st && st.theme) || 'midnight';
    var accent = (st && st.accent) || 'gold';
    var density = (st && st.density) || 'comfortable';
    var reduced = st && st.reducedEffects;
    var fast = st && st.highRefresh;
    var lang = (st && st.language) || 'ar';
    var ACCENT = { emerald:'#1DB954', rose:'#FA2D55', violet:'#8B5CF6', cyan:'#00D4FF', amber:'#FFB800', gold:'#D4AF37' };
    var hex = ACCENT[accent] || ACCENT.gold;
    d.dataset.theme = theme;
    d.dataset.density = density;
    d.dataset.motion = reduced ? 'reduced' : (fast ? 'fast' : 'normal');
    d.dataset.lang = lang;
    d.style.setProperty('--app-accent', hex);
    d.style.setProperty('--dynamic-primary', hex);
    d.style.setProperty('--dynamic-glow', hex + '40');
    d.lang = lang === 'ar' ? 'ar' : 'en';
    d.dir = lang === 'ar' ? 'rtl' : 'ltr';
    d.classList.add('dark');
  } catch(e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      </head>
      <body className="font-body text-[var(--app-text)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
