import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import localFont from 'next/font/local'
import './globals.css'
import { AppProviders } from '@/components/app-providers'

/*
  Type: Geist Sans and Geist Mono, both variable, which is what lets the
  product use weights 425, 510 and 590 rather than rounding to 400/500/600.

  From the `geist` package, Vercel's own distribution, which ships the
  variable woff2 files and loads them through next/font/local. The product
  is sold as air-gapped, and next/font/google, which this used before,
  downloads the files from Google when the app is built: on a machine that
  could not reach Google the dev server quietly fell back to system faces,
  and every ledger figure on every screen lost its monospace. Nothing here
  reaches the network now, at build time or at runtime.

  The package sets the same CSS variables used before, --font-geist-sans and
  --font-geist-mono, so globals.css needed no change.

  Instrument Serif is the Recall scheme's third voice: the one italic phrase
  in a heading, in red. Bundled here as woff2 (app/fonts, SIL Open Font
  License) for the same reason as Geist.
*/
const instrument = localFont({
  src: [
    { path: './fonts/instrument-serif-regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/instrument-serif-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument',
  display: 'swap',
})

/*
  The theme is applied before first paint, so a reader who chose ink night
  never sees a flash of paper. A saved choice wins; otherwise the operating
  system's preference; paper when neither can be read. data-js marks the page
  as scripted, which is what lets the public page's reveal start hidden: with
  no JavaScript, nothing is ever hidden.
*/
const THEME_BOOT =
  "(function(){document.documentElement.dataset.js='1';try{var t=localStorage.getItem('aegis-theme');if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();"

// The description states the mechanism, not an absolute. "Never leave the
// host" was a guarantee this page could not show; what the product does show
// is that every answer is cited, checked and recorded on this machine. The
// public page at / sets its own title and description in its layout.
export const metadata: Metadata = {
  title: 'Aegis — On-Premise Agentic AI Workbench',
  description:
    'A self-hosted agentic AI workbench for regulated industrial work. Models, retrieval, the sandbox and the audit log run on this host; every answer is cited, checked against policy and recorded.',
  applicationName: 'AEGIS',
}

export const viewport: Viewport = {
  // Both follow the palette. themeColor is what a mobile browser paints its
  // chrome with, so it tracks the theme the operating system asks for.
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfa' },
    { media: '(prefers-color-scheme: dark)', color: '#131210' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      // globals.css sets scroll-behavior: smooth for the landing page's
      // anchors. Next 16 stopped suspending that during route changes on
      // its own, so without this a navigation from a scrolled screen would
      // visibly glide to the top of the next one. This attribute is Next's
      // opt-in to suspend it for navigations and keep it for anchors.
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrument.variable} bg-background`}
      // The boot script sets data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
