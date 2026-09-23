import type { ReactNode } from 'react'
import { Navigation } from '@/components/navigation'
import { AuthGuard } from '@/components/auth-guard'
import { CommandPalette } from '@/components/command-palette'

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
        {/* Mounted once for the whole app: the shortcut has to work from
            every screen, including one that has scrolled away from the
            header. */}
        <CommandPalette />
        {/*
          The header is fixed and 56px tall. It was a 90px floating card and
          this was 106px to clear it; flattened to a bar on a hairline, the
          same clearance would leave fifty pixels of gap under the rule.
        */}
        <main className="relative z-10 flex-1 pt-[72px]">{children}</main>
      </div>
    </AuthGuard>
  )
}


