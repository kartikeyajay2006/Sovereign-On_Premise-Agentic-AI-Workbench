import type { ReactNode } from 'react'
import { Navigation } from '@/components/navigation'
import { AuthGuard } from '@/components/auth-guard'
import { CommandPalette } from '@/components/command-palette'
import { RouteStage } from '@/shared/motion/route-stage'

/**
 * The app frame: one room, lit from above, with the instrument's header
 * fixed at the top and the screens changing beneath it.
 *
 * Three things live here and nowhere else.
 *
 * The lamp. The tech-grid that sat here was `fixed -z-10` under a body
 * with an opaque background, which paints over anything at a negative
 * z-index -- so the grid was paid for on every screen and never seen. It
 * is replaced by one static, hueless falloff from the top of the frame
 * (--lamp in globals.css), at z-0 where it can actually be seen, beneath
 * <main> at z-10. It carries no state and never moves. The canvas that
 * preceded both, redrawing a dot field every frame on the thread that
 * parses the event stream, is not coming back: the event bus drops events
 * for a subscriber that falls behind, so main-thread time spent on
 * decoration is time in which records can be lost.
 *
 * The top inset. The header is 56px, and 92px on the three Assurance
 * screens, which carry a second row. <main> clears it with --shell-top,
 * which the frame raises itself when the second row is present (see
 * .app-frame in globals.css), so a screen that sizes itself to the
 * viewport uses calc(100dvh - var(--shell-top)), and a sticky element
 * sticks at top: var(--shell-top), and both are right on every screen.
 * Screens outside Assurance (Approvals, the thread's run rail) still
 * resolve it to 72px, the value they were written against.
 *
 * The turn between screens. <RouteStage> hands navigations to the View
 * Transitions API: the header holds still and the next screen settles
 * into place, readable from its first frame.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      {/*
        overflow-x-clip, not -hidden. `hidden` makes this frame a scroll
        container, and a sticky element sticks to its nearest scroll
        container -- so every `position: sticky` inside the app (the thread's
        run rail, a table's header) was sticking to a box that never scrolls,
        which is to say not sticking at all. `clip` trims the same sideways
        overflow without creating a scroll container.
      */}
      <div className="app-frame relative flex min-h-dvh flex-col overflow-x-clip">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[var(--z-tooltip)] focus:rounded-[var(--radius)] focus:bg-surface focus:px-3 focus:py-2 focus:text-body focus:text-foreground focus:shadow-[var(--focus-ring)]"
        >
          Skip to content
        </a>

        <div
          aria-hidden
          className="app-atmosphere pointer-events-none fixed inset-x-0 top-0 z-0 h-[520px]"
        />

        <Navigation />
        {/* Mounted once for the whole app: the shortcut has to work from
            every screen, including one scrolled away from the header. */}
        <CommandPalette />

        <RouteStage>
          <main id="main" tabIndex={-1} className="relative z-10 flex-1 pt-[var(--shell-top)] outline-none">
            {children}
          </main>
        </RouteStage>
      </div>
    </AuthGuard>
  )
}
