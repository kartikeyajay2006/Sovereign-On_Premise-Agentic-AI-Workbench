import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The product's type scale, declared as `@theme` tokens in app/globals.css.
 *
 * tailwind-merge ships a table of Tailwind's own class names so it can tell
 * which utilities conflict. It has no way to see a Tailwind v4 CSS-first
 * `@theme` block, so every one of these is an unknown `text-*` -- and its
 * fallback for an unknown `text-*` is to assume a colour.
 *
 * The consequence is silent and was live on screen: `cn('text-ledger', ...,
 * 'text-foreground')` looked to twMerge like two text colours, so it dropped
 * the first as superseded. The class never reached the DOM and the element
 * inherited 16px where 10px was specified -- no error, no warning, just type
 * at the wrong size. The composer's deliverable row was rendering at 16px
 * instead of 10px for exactly this reason.
 *
 * Declaring them as font-size classes restores the real conflict groups: a
 * size supersedes a size, a colour supersedes a colour, and the two no longer
 * collide.
 */
const TEXT_SIZES = [
  'display',
  'title',
  'heading',
  'answer',
  'body',
  'ui',
  'meta',
  'ledger',
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TEXT_SIZES] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
