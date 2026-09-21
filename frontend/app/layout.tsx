import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AppProviders } from '@/components/app-providers'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Aegis — On-Premise Agentic AI Workbench',
  description:
    'Air-gapped, self-hosted agentic AI platform for confidential industrial environments. Models, sandboxes, documents and audit trails never leave the host.',
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
