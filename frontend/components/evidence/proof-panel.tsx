'use client'

import { useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { request } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/ui/controls/button'

/**
 * The run's signed certificate, checked where the reader can see it.
 *
 * The certificate binds the run's request, answer, evidence, calculations,
 * conflict resolutions, verification, approval and deliverable bytes, by
 * hash, under an audit root this host signed. "Verify" asks the host to check
 * it against its key, its audit log and its deliverable store, and lists each
 * check as it came back. The file itself can be taken away and checked
 * offline with scripts/verify_certificate.py and the public key.
 */

interface ProofCheck {
  name: string
  passed: boolean
  detail: string
}

interface Verified {
  valid: boolean
  key_id: string
  checks: ProofCheck[]
}

type Certificate = Record<string, unknown> & {
  content_sha256: string
  audit: { root: { events: number; merkle_root: string; sealed_at: string }; events: unknown[] }
}

export function ProofPanel({ taskId }: { taskId: string }) {
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [verified, setVerified] = useState<Verified | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verify = async () => {
    setBusy(true)
    setError(null)
    try {
      const issued = await request<Certificate>(`/tasks/${encodeURIComponent(taskId)}/certificate`)
      setCertificate(issued)
      setVerified(
        await request<Verified>('/proof/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(issued),
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The certificate could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    if (!certificate) return
    const blob = new Blob([JSON.stringify(certificate, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `aegis-certificate-${taskId.slice(0, 8)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-label="Signed proof" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-ui font-medium text-foreground">
          <ShieldCheck className="h-4 w-4 text-foreground-secondary" aria-hidden />
          Signed proof
        </h3>
        <div className="flex items-center gap-2">
          {certificate && (
            <Button variant="ghost" size="sm" ground="paper" onClick={download}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Certificate
            </Button>
          )}
          <Button variant="secondary" size="sm" ground="paper" busy={busy} busyLabel="Verifying…" onClick={() => void verify()}>
            {verified ? 'Verify again' : 'Verify this run'}
          </Button>
        </div>
      </div>
      {!verified && !error && (
        <p className="text-ui text-foreground-muted">
          Checks the run&apos;s certificate against this host&apos;s Ed25519 key, its sealed audit log and the
          deliverable bytes on disk.
        </p>
      )}
      {error && <p className="text-ui text-critical-text">{error}</p>}
      {verified && certificate && (
        <>
          <p className={cn('text-ui font-medium', verified.valid ? 'text-sovereign-text' : 'text-critical-text')}>
            {verified.valid ? 'Every check holds.' : 'The certificate does not hold.'}{' '}
            <span className="font-mono text-meta font-normal text-foreground-muted">
              key {verified.key_id} · {certificate.audit.events.length} audit events under a root over{' '}
              {certificate.audit.root.events} · sha256:{certificate.content_sha256.slice(0, 16)}…
            </span>
          </p>
          <ul className="flex flex-col">
            {verified.checks.map((check) => (
              <li
                key={check.name}
                className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 border-b border-line-subtle py-1.5 last:border-b-0"
              >
                <span
                  aria-label={check.passed ? 'held' : 'failed'}
                  className={cn('font-mono text-ui', check.passed ? 'text-sovereign-text' : 'text-critical-text')}
                >
                  {check.passed ? '✓' : '✕'}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-ui text-foreground">{check.name}</span>
                  <span className="text-[12px] text-foreground-muted">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
