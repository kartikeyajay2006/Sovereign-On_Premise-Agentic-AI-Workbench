'use client'

import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from './preferences'

/**
 * A stable callback ref. A callback, so one element type is never asserted
 * over another (an <li> ref is not an HTMLDivElement ref); stable, so React
 * does not detach and re-attach it on every render.
 */
function useNodeRef() {
  const node = useRef<HTMLElement | null>(null)
  const attach = useCallback((el: HTMLElement | null) => {
    node.current = el
  }, [])
  return [node, attach] as const
}

/**
 * TRACE: a citation leading to its source.
 *
 * The claim is only worth what it rests on, so the move from one to the
 * other has to be unmistakable: the source is brought into view and an ink
 * ring contracts onto it, holds long enough to be found, and lets go,
 * leaving the target's own selected style in place. Contracting reads as
 * landing; a ring that expanded outward would read as something leaving.
 *
 * Ink, never a status hue. Tracing is the reader navigating, and a
 * selection that glowed green would read as a verdict nobody reached.
 */

type TraceTag = 'div' | 'li' | 'article' | 'section' | 'span'

export interface TraceTargetProps extends HTMLAttributes<HTMLElement> {
  as?: TraceTag
  /** This element is the source currently being traced to. */
  active: boolean
  /**
   * Changes each time the reader traces to it again -- a counter bumped by
   * each click -- so a second click on the same citation lands again
   * rather than doing nothing.
   */
  token?: string | number
  /** Where to bring it: `nearest` in a rail, `center` on a page. */
  block?: ScrollLogicalPosition
  children: ReactNode
}

export function TraceTarget({
  as: Tag = 'div',
  active,
  token,
  block = 'nearest',
  className,
  children,
  ...rest
}: TraceTargetProps) {
  const [node, attach] = useNodeRef()
  const reduced = useReducedMotion()
  const [landings, setLandings] = useState(0)

  useEffect(() => {
    if (!active) return
    // Smooth only when motion is welcome: a reduced-motion reader is taken
    // there at once, which is the correct behaviour rather than a lesser one.
    node.current?.scrollIntoView({ block, behavior: reduced ? 'auto' : 'smooth' })
    setLandings((n) => n + 1)
    // `reduced` and `block` are read at the moment of tracing; a change to
    // either is not itself a trace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, token])

  return (
    <Tag {...rest} ref={attach} className={cn('aegis-trace', className)}>
      {children}
      {active && landings > 0 && (
        <span key={landings} aria-hidden className="aegis-trace-land" />
      )}
    </Tag>
  )
}

/**
 * The cross-link: hover or focus anything carrying `data-trace="S3"` inside
 * the scope, and every element with the same id lights together -- the
 * citation chip in the answer and the evidence row in the rail. One
 * delegated listener for the whole scope, and one attribute set and
 * cleared per hover; no state, so nothing re-renders.
 *
 * Styled by `[data-trace-lit]` in globals.css: a 1px ink ring, drawn as a
 * shadow so it moves nothing.
 */
export function TraceScope({
  as: Tag = 'div',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: TraceTag; children: ReactNode }) {
  const [node, attach] = useNodeRef()

  useEffect(() => {
    const root = node.current
    if (!root) return
    let lit: string | null = null

    const light = (id: string | null) => {
      if (id === lit) return
      const selector = (value: string) => `[data-trace="${CSS.escape(value)}"]`
      if (lit) root.querySelectorAll(selector(lit)).forEach((el) => el.removeAttribute('data-trace-lit'))
      lit = id
      if (id) root.querySelectorAll(selector(id)).forEach((el) => el.setAttribute('data-trace-lit', ''))
    }
    const idOf = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest('[data-trace]')?.getAttribute('data-trace') ?? null) : null

    const onOver = (event: Event) => light(idOf(event.target))
    const onLeave = () => light(null)
    const onFocusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) light(null)
    }

    root.addEventListener('pointerover', onOver)
    root.addEventListener('focusin', onOver)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('focusout', onFocusOut)
    return () => {
      light(null)
      root.removeEventListener('pointerover', onOver)
      root.removeEventListener('focusin', onOver)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('focusout', onFocusOut)
    }
  }, [node])

  return (
    <Tag {...rest} ref={attach} className={className}>
      {children}
    </Tag>
  )
}
