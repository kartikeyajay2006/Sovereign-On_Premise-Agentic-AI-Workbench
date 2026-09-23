import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AppProviders } from '@/components/app-providers'

/*
  Type: Geist Sans and Geist Mono, both variable, which is what lets the
  product use weights 425, 510 and 590 rather than rounding to 400/500/600.

  KNOWN CONTRADICTION, deliberately left in place until the package is
  installed: next/font/google downloads these files from Google when the
  app is BUILT. The pages never fetch a font at runtime -- Next self-hosts
  what it downloaded -- but a build on an air-gapped machine has no Google
  to download from, and the product is sold as air-gapped. Vercel's font
  page is also reported (docs/plan/14, section 2.6) to say that Google's
  copy is a reduced cut of Geist; that has not been checked here.

  The local fix is the `geist` package (Vercel's own distribution, which
  ships the variable woff2 files and loads them through next/font/local):

    npm install geist

  and then replace the import above and the two constants below with

    import { GeistSans } from 'geist/font/sans'
    import { GeistMono } from 'geist/font/mono'

  using GeistSans.variable and GeistMono.variable on <html>. The package
  sets the same CSS variables used here, --font-geist-sans and
  --font-geist-mono, so globals.css needs no change. That is a new
  dependency, so it is the lead's decision, not this file's; see
  docs/design/DIRECTION.md, "Type".
*/
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

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
  // chrome with, and leaving it on paper white put a bright bar above a dark
  // application.
  colorScheme: 'dark',
  themeColor: '#100e0b',
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
      className={`${geistSans.variable} ${geistMono.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
