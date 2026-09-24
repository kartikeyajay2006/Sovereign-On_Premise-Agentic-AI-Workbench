'use client'

import type { ReactNode } from 'react'
import { RoleProvider } from './role-context'
import { ToastProvider } from './toast'

/**
 * The custom cursor is gone.
 *
 * <SovereignCursor/> replaced the native pointer with a drawn reticle: a
 * permanent requestAnimationFrame loop, a seven-selector `closest()` walk on
 * every mousemove, and listeners that re-registered whenever the pointer
 * entered or left an element. It set `cursor: none !important` globally,
 * which means that if it failed to hydrate — on a judging laptop, mid-demo —
 * the operator had no cursor at all and no way to recover.
 *
 * It also read as styling rather than instrumentation, on a product whose
 * credibility rests on looking like something a regulated plant would run.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <ToastProvider>{children}</ToastProvider>
    </RoleProvider>
  )
}
