import { ViewTransition, type ReactNode } from 'react'

/**
 * TURN: moving between screens -- the same instrument, a different reading.
 *
 * Wraps the app's <main>. A navigation is a React transition, so React
 * hands the DOM change to the browser's View Transitions API, and the CSS
 * for the `aegis-turn` class in globals.css decides what that looks like:
 * the header stays put, the previous screen is cut rather than faded, and
 * the next one settles 6px upward at full opacity over 200ms. The new
 * screen is legible from its first frame, so nothing waits on the motion.
 *
 * `update`, not `enter`/`exit`: the layout persists across navigations, so
 * this boundary never mounts or unmounts -- its content changes. And
 * `default="none"`, so no other kind of transition animates it.
 *
 * Only transitions trigger it. An event stream's setState is not a
 * transition, so a live run updating the page never snapshots it, and a
 * browser without the API simply navigates without the settle.
 *
 * No hooks, so it renders inside the (app) layout, a Server Component.
 */
export function RouteStage({ children }: { children: ReactNode }) {
  return (
    <ViewTransition update="aegis-turn" default="none">
      {children}
    </ViewTransition>
  )
}
