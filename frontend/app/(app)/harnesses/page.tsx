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
        <p className="mx-auto w-full max-w-[1200px] px-5 py-8 font-mono text-meta text-foreground-muted lg:px-10">
          Opening harnesses…
        </p>
      }
    >
      <HarnessWorkbench />
    </Suspense>
  )
}
