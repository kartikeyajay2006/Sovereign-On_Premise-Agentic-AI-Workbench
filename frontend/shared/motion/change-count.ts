'use client'

import { useState } from 'react'

/**
 * How many times `value` has changed since the component mounted.
 *
 * Zero on the first render and for as long as the value holds, so a state
 * that was already true when the screen opened is shown in its final frame,
 * never animated into. Each change after mount bumps it: key a motion on the
 * count and it replays exactly once per real change.
 *
 * Derived during render, as React documents for state that follows a prop,
 * so the motion starts in the same render that shows the new value.
 */
export function useChangeCount<T>(value: T): number {
  const [seen, setSeen] = useState<{ value: T; count: number }>(() => ({ value, count: 0 }))
  if (!Object.is(seen.value, value)) {
    const next = { value, count: seen.count + 1 }
    setSeen(next)
    return next.count
  }
  return seen.count
}
