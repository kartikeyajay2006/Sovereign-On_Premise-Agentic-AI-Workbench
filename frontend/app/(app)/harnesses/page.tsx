import { Suspense } from 'react'
import { HarnessWorkbench } from '@/features/harness/ui/harness-workbench'

/**
 * Harnesses: governed, reusable, multi-run jobs.
 *
 * The workbench reads its view from the query string, and a production build
 * refuses a static page whose client component calls useSearchParams outside
 * a Suspense boundary. The fallback says what is happening rather than
 * drawing a skeleton of content that may not exist.
 */
export default function HarnessesPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto w-full max-w-[1400px] px-4 py-8 font-mono text-meta text-foreground-muted sm:px-6">
          Opening harnesses…
        </p>
      }
    >
      <HarnessWorkbench />
    </Suspense>
  )
}
