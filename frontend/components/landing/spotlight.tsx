'use client'

import { useCallback, type ReactNode, type PointerEvent } from 'react'

/**
 * A soft light that follows the pointer across the cards inside it.
 *
 * The position goes to two CSS variables on the card under the pointer, and
 * the light is a gradient the stylesheet draws from them: no React state, no
 * re-render, one style write per pointer move over a card. Nothing happens
 * for touch, or while the pointer is elsewhere.
 */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const onMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    const card = (event.target as HTMLElement).closest<HTMLElement>('.ae-tile')
    if (!card) return
    const rect = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    card.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }, [])
  return (
    <div className={className} onPointerMove={onMove}>
      {children}
    </div>
  )
}
