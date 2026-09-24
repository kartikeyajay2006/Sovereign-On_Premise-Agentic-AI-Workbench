import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A selection marquee: the words boxed, the box cross-hatched, a handle at
 * each corner -- the mark a reviewer's selection tool leaves.
 *
 * It is used in exactly one kind of place: inside a retrieved passage, around
 * the words that settle the sentence citing that passage. There it is doing a
 * job. The same device set around a phrase in a headline would be decoration,
 * and it would fight the serif-italic turn that every heading on this page
 * already uses for emphasis -- two emphases in one line is none. So it stays
 * out of the headings.
 *
 * Ink, not the lime action colour. Lime means "you can press this" and this
 * box cannot be pressed; the product's own rule is that selection is ink and
 * never a status hue, so that "selected" can never read as "verified" or as a
 * button.
 *
 * A <mark>, because that is what the element is for: text highlighted for its
 * relevance in another context. The UA's yellow fill is removed and the
 * semantics kept.
 *
 * inline-block, so the box never breaks across two lines and loses a corner.
 * Every phrase it is given is a few words.
 */

// Two diagonal families at 10% ink, 6px apart. Fainter than that disappears on
// a projector; stronger and it starts to grey the words it is meant to point
// at. Measured (WCAG 2.x, the mix computed in OKLab as color-mix does it):
// --foreground on --background is 16.45:1, on a hatch line 13.88:1, and where
// the two families cross 11.08:1. On --surface the same three are 15.27,
// 12.55 and 9.83. The worst pixel under the words still clears AAA's 7:1.
const HATCH =
  'repeating-linear-gradient(45deg, color-mix(in oklab, var(--foreground) 10%, transparent) 0 1px, transparent 1px 6px),' +
  'repeating-linear-gradient(-45deg, color-mix(in oklab, var(--foreground) 10%, transparent) 0 1px, transparent 1px 6px)'

const HANDLE = 'pointer-events-none absolute size-[5px] bg-foreground'

export function Marquee({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <mark
      className={cn(
        'relative inline-block bg-transparent px-[5px] py-px text-inherit',
        // Handles overhang the box by 2px, so a box set flush against a
        // container edge keeps them.
        'mx-[2px]',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: HATCH,
          boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--foreground) 55%, transparent)',
        }}
      />
      <span aria-hidden className={cn(HANDLE, '-left-[2px] -top-[2px]')} />
      <span aria-hidden className={cn(HANDLE, '-right-[2px] -top-[2px]')} />
      <span aria-hidden className={cn(HANDLE, '-bottom-[2px] -left-[2px]')} />
      <span aria-hidden className={cn(HANDLE, '-bottom-[2px] -right-[2px]')} />
      <span className="relative text-foreground">{children}</span>
    </mark>
  )
}
