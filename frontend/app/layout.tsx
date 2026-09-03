import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Typefaces are vendored into `public/fonts` and loaded locally.
 *
 * An air-gapped product must not reach a font CDN — not at runtime, and not
 * at build time either, or it cannot be rebuilt inside the customer's
 * network. Archivo carries the panel lettering; IBM Plex Mono is reserved for
 * genuine instrument data: tags, hashes, readings, counters, timestamps.
 */
const archivo = localFont({
  src: [{ path: "../public/fonts/archivo-variable.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-archivo",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const plexMono = localFont({
  src: [
    { path: "../public/fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/ibm-plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "Sovereign Workbench",
  description:
    "Air-gapped industrial AI workbench. All inference, retrieval, code execution and document generation happen on this host.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#081116",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
