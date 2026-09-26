import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ProofScreen } from '@/features/proof/ui/proof-view'

export const metadata: Metadata = { title: 'Proof · Aegis' }

/**
 * Proof Mode, at /proof?run=<id>.
 *
 * The screen reads its run from the query string, and a production build
 * refuses a static page whose client component calls useSearchParams outside
 * a Suspense boundary.
 */
export default function ProofPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto w-full max-w-[1400px] px-4 py-8 font-mono text-meta text-foreground-muted sm:px-6">
          Opening the proof…
        </p>
      }
    >
      <ProofScreen />
    </Suspense>
  )
}
