import type { ReactNode } from 'react'
import { Navigation } from '@/components/navigation'
import { AuthGuard } from '@/components/auth-guard'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
        {/*
          A static grid, not an animated one.

          This was <AnimatedTechnicalBackground/>, a canvas redrawing a field
          of dots on every frame behind every page — roughly 2,500 arc-and-
          stroke operations per frame at 1080p, on the main thread, for the
          entire life of the session. It never corresponded to anything the
          system was doing.

          That matters here beyond smoothness. The event bus in
          backend/core/events.py drops records for a subscriber that cannot
          keep up, so main-thread time spent animating decoration is time in
          which stage and evidence events can be lost — and this host runs
          local model inference at the same time, which wants that CPU.

          The `tech-grid` utility was already in globals.css and is the same
          visual idea at zero cost. The green radial wash that sat above it
          is gone too: a --sovereign glow across every screen reads as a
          status signal, and nothing was signalling.
        */}
        <div aria-hidden className="tech-grid pointer-events-none fixed inset-0 -z-10 opacity-40" />

        <Navigation />
        {/*
          The header is fixed and 90px tall: a status strip over a nav bar.
          This was 76px, so the first 14px of every screen sat underneath it
          and the opening line of a thread was clipped. Measured, plus 16px
          so the content clears the rule rather than touching it.
        */}
        <main className="relative z-10 flex-1 pt-[106px]">{children}</main>
      </div>
    </AuthGuard>
  )
}


