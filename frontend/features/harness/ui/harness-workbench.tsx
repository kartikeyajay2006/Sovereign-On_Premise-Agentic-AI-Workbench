'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { HarnessConfigure } from './harness-configure'
import { HarnessLibrary } from './harness-library'
import { HarnessRunScreen } from './harness-run-view'

/**
 * /harnesses, addressed by query string like the thread's ?run=.
 *
 *   /harnesses                    the library and past runs
 *   /harnesses?harness=<id>       configure and preview one harness
 *   /harnesses?run=<run id>       one run: live board, then its report
 *
 * A run is reachable by URL, so a reviewer can be sent the exact run whose
 * report is waiting on them, and the back button walks the same path the
 * person took.
 */
export function HarnessWorkbench() {
  const router = useRouter()
  const params = useSearchParams()
  const runId = params.get('run')
  const harnessId = params.get('harness')

  const toLibrary = useCallback(() => router.push('/harnesses'), [router])
  const toRun = useCallback(
    (id: string) => router.push(`/harnesses?run=${encodeURIComponent(id)}`),
    [router],
  )
  const toConfigure = useCallback(
    (id: string) => router.push(`/harnesses?harness=${encodeURIComponent(id)}`),
    [router],
  )

  if (runId) return <HarnessRunScreen key={runId} runId={runId} onBack={toLibrary} />
  if (harnessId) {
    return (
      <HarnessConfigure key={harnessId} harnessId={harnessId} onBack={toLibrary} onStarted={toRun} />
    )
  }
  return <HarnessLibrary onConfigure={toConfigure} onOpenRun={toRun} />
}
