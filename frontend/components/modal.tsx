'use client'

import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const WIDTH = {
  sm: 'max-w-[400px]',
  md: 'max-w-[512px]',
  lg: 'max-w-[640px]',
} as const

/**
 * A decision that interrupts the screen.
 *
 * What changed, and why each one matters on a screen where the modal is the
 * last step before an irreversible release:
 *
 * - Focus moves into the dialog when it opens, Tab cannot leave it, and focus
 *   returns to whatever opened it when it closes. It had none of the three,
 *   so a keyboard user pressing Tab after "Approve" walked straight out of
 *   the dialog into the page behind the scrim.
 * - It renders into document.body, so no transformed or clipped ancestor can
 *   trap a fixed-position overlay inside itself.
 * - Escape is handled once, at the document, and marked handled, so a screen
 *   that binds its own keys can tell the dialog already took it.
 * - `onClose` is read through a ref. It was an effect dependency, and every
 *   caller passes an inline arrow, so the effect re-ran on every keystroke in
 *   the notes field.
 * - Motion is the spatial tier: the panel rises 4px into place at full
 *   opacity, so its content is legible from the first frame. The scrim is the
 *   only thing that fades.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  className,
  size = 'md',
  initialFocusRef,
}: {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  /** One sentence under the title, announced as the dialog's description. */
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  size?: keyof typeof WIDTH
  /** What receives focus on open. Defaults to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first =
      initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel ?? null
    first?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      )
      if (nodes.length === 0) {
        event.preventDefault()
        return
      }
      const firstNode = nodes[0]
      const lastNode = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault()
        lastNode.focus()
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault()
        firstNode.focus()
      }
    }

    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
    // initialFocusRef is a ref; reading it on open is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-[var(--scrim)] animate-in fade-in duration-[var(--standard)] ease-[var(--ease-standard)]"
        onClick={() => onCloseRef.current()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[calc(100dvh-32px)] w-full flex-col overflow-hidden rounded-[var(--radius-lg-token)] bg-surface shadow-[var(--elev-3)] outline-none',
          'animate-in slide-in-from-bottom-1 duration-[var(--spatial)] ease-[var(--ease-spatial)] motion-reduce:animate-none',
          WIDTH[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow && (
              <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                {eyebrow}
              </span>
            )}
            <h2 id={titleId} className="text-heading font-medium tracking-[var(--ls-heading)] text-foreground">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="text-body text-foreground-secondary">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            className="hover-decay -mr-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-foreground-muted hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pb-5 pt-2">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line-subtle px-5 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
