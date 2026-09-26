import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CompareScreen } from '@/features/compare/ui/compare-view'

export const metadata: Metadata = { title: 'Compare · Aegis' }

/**
 * Two runs side by side, at /compare?a=<run>&b=<run>.
 *
 * The screen reads its runs from the query string, and a production build
 * refuses a static page whose client component calls useSearchParams outside
 * a Suspense boundary.
 */
export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto w-full max-w-[1400px] px-4 py-8 font-mono text-meta text-foreground-muted sm:px-6">
          Opening the comparison…
        </p>
      }
    >
      <CompareScreen />
    </Suspense>
  )
}
