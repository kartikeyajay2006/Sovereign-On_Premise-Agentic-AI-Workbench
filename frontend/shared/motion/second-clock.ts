'use client'

import { useSyncExternalStore } from 'react'

/**
 * One clock for every live counter on the page, ticking on the second.
 *
 * Each counter used to keep its own 10 Hz interval, so a run in flight
 * re-rendered its elapsed time and its stage's dwell twenty times a second
 * -- style, layout and paint on the main thread, on a host whose CPU the
 * model is already holding. Measured on the demo laptop, a 71 s run spent
 * 31 s of it with the page's main thread blocked. The counters now share
 * one timer, aligned to the whole second, and advance together in one
 * render: a counter that reads "12s" has nothing to show between seconds.
 */

const listeners = new Set<() => void>()
let now = Date.now()
let timer: number | null = null

function schedule() {
  // To the next whole second, so counters mounted at different moments
  // still change in the same frame.
  timer = window.setTimeout(() => {
    now = Date.now()
    for (const listener of listeners) listener()
    if (listeners.size > 0) schedule()
    else timer = null
  }, 1000 - (Date.now() % 1000))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer === null) {
    now = Date.now()
    schedule()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }
}

const read = () => now

/** The time, in ms, as of the last whole second. */
export function useSecondClock(): number {
  return useSyncExternalStore(subscribe, read, read)
}
