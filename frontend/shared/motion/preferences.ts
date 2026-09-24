'use client'

import { useSyncExternalStore } from 'react'

/**
 * The two facts every motion primitive has to respect before it moves
 * anything: whether the reader has asked for less motion, and whether
 * anyone can see the page at all.
 *
 * Both are read through useSyncExternalStore, so a component re-renders
 * when the answer changes -- a reader can switch reduced motion on while
 * the workbench is open, and a tab is hidden and shown many times in a
 * demo -- and the server snapshot is the conservative answer, so nothing
 * rendered before hydration assumes it may animate.
 */

const REDUCE = '(prefers-reduced-motion: reduce)'

function subscribeReduced(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(REDUCE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** A one-off read, for code that runs outside React (a WAAPI sequence). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCE).matches
  )
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false)
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/**
 * False while the tab is hidden. A browser throttles CSS animation in a
 * hidden tab by itself; this is for the few things that are not CSS --
 * a scroll, a timer -- and would otherwise run for nobody while a local
 * model competes for the same CPU.
 */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== 'hidden',
    () => true,
  )
}
