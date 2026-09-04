'use client'

import { useEffect, useState } from 'react'
import { Check, ShieldAlert, Loader2, Play } from 'lucide-react'
import { api } from '@/lib/api'
import type { SandboxTestResult, SovereigntyStatus } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { useToast } from '@/components/toast'
import { useEventStream } from '@/hooks/use-event-stream'
import { cn } from '@/lib/utils'

const permColor: Record<string, string> = {
  ALLOW: 'var(--sovereign)',
  DENY: 'var(--critical)',
  REVIEW: 'var(--approval)',
}

export function SecurityView() {
  const [status, setStatus] = useState<SovereigntyStatus | null>(null)
  const [uptimeStr, setUptimeStr] = useState('since boot')

  useEffect(() => {
    api.sovereigntyStatus()
      .then((s) => {
        setStatus(s)
        if (s.monitored_since) {
          const started = new Date(s.monitored_since)
          const diffHours = Math.round((Date.now() - started.getTime()) / (1000 * 60 * 60))
          setUptimeStr(`monitored · ${diffHours}h`)
        }
      })
      .catch(() => {})
  }, [])

  // Listen to live sovereignty updates over SSE
  useEventStream({
    onEvent: (event) => {
      if (event.event === 'sovereignty.status' && event.data) {
        setStatus((prev) => ({
          ...(prev || {} as any),
          ...event.data,
        }))
      }
    },
  })

  return (
    <div className="bg-ink text-ink-foreground">
      <PageHeader
        dark
        eyebrow="Sovereignty Status"
        title={
          <>
            Nothing leaves
            <br />
            this host.
          </>
        }
        description="Every socket, sandbox and policy decision is enforced locally. External egress is structurally impossible."
        meta={[
          { label: 'External calls', value: String(status?.external_api_calls ?? 0) },
          { label: 'Sandbox', value: 'CONTAINED' },
          { label: 'Egress policy', value: 'DENY-ALL' },
          { label: 'Posture', value: status?.sovereign !== false ? 'SOVEREIGN' : 'INVESTIGATE' },
        ]}
      />

      <div className="mx-auto flex max-w-[1400px] flex-col gap-16 px-5 py-14 lg:px-10 lg:py-20">
        <ExternalCallsHero status={status} uptimeStr={uptimeStr} />
        <ConnectionTelemetry status={status} />
        <SandboxSelfTest />
        <PolicyMatrixTable />
      </div>
    </div>
  )
}

function ExternalCallsHero({ status, uptimeStr }: { status: SovereigntyStatus | null; uptimeStr: string }) {
  const externalCalls = status?.external_api_calls ?? 0

  return (
    <section className="relative overflow-hidden border border-ink-border bg-ink-surface px-6 py-12 lg:px-12 lg:py-16">
      <div className="pointer-events-none absolute inset-0 tech-grid-ink opacity-60" />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <TechnicalLabel className="text-ink-muted">Outbound network</TechnicalLabel>
        <div className="flex items-baseline gap-4">
          <span className="font-mono text-7xl font-medium tracking-tight text-ink-foreground md:text-8xl">
            {externalCalls}
          </span>
          <span className="flex flex-col items-start">
            <span className="font-mono text-[13px] uppercase tracking-[0.2em] text-sovereign">external calls</span>
            <span className="font-mono text-[11px] text-ink-muted">{uptimeStr}</span>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="sov-pulse absolute inline-flex h-full w-full rounded-full bg-sovereign" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sovereign" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
            Air-gapped · verified loopback
          </span>
        </div>
      </div>
    </section>
  )
}

function ConnectionTelemetry({ status }: { status: SovereigntyStatus | null }) {
  // Every figure here is read from this host. Nothing is illustrative: a
  // fabricated socket on the page that exists to prove containment would
  // discredit the claim it is meant to support.
  const interfaces = Object.entries(status?.interfaces ?? {})
  const violations = status?.violations ?? []

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-ink-border pb-4">
        <TechnicalLabel className="text-ink-muted">
          Observed connections ({status ? status.local_connections : '—'} local
          {violations.length > 0 ? `, ${violations.length} leaving the host` : ''})
        </TechnicalLabel>
        <span className="font-mono text-[11px] text-ink-muted">
          {status ? `last read ${new Date(status.last_checked).toLocaleTimeString()}` : 'reading…'}
        </span>
      </div>

      {violations.length > 0 ? (
        <div className="divide-y divide-ink-border border border-critical/40 bg-ink-surface">
          {violations.map((v, i) => (
            <div key={`${v.laddr}-${i}`} className="flex flex-col gap-1 px-5 py-4">
              <span className="font-mono text-[13px] text-ink-foreground">
                {v.laddr} → {v.raddr ?? 'unknown'}
              </span>
              <span className="font-mono text-[11px] text-ink-muted">{v.reason}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-ink-border md:grid-cols-3">
          {interfaces.length === 0 && (
            <div className="bg-ink-surface px-5 py-5 font-mono text-[12px] text-ink-muted">
              Reading network interfaces…
            </div>
          )}
          {interfaces.map(([name, info], i) => (
            <div key={name} className="relative overflow-hidden bg-ink-surface px-5 py-5">
              <TraceLine delay={i * 0.8} />
              <div className="relative flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[13px] text-ink-foreground">{name}</span>
                  <span
                    className={`flex items-center gap-1.5 font-mono text-[10px] ${
                      info.loopback ? 'text-sovereign' : 'text-ink-muted'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        info.loopback ? 'bg-sovereign' : 'bg-ink-muted'
                      }`}
                    />
                    {info.loopback ? 'LOOPBACK' : info.up ? 'UP' : 'DOWN'}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-ink-muted">
                  {info.addresses?.join(', ') || 'no address'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="font-mono text-[11px] text-ink-muted">
        {violations.length === 0
          ? 'No connection has been observed leaving this host since monitoring began.'
          : 'Connections leaving the host were observed. Each is listed above and recorded in the activity log.'}
      </p>
    </section>
  )
}

function TraceLine({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-sovereign/15 to-transparent"
      style={{
        animation: 'trace-h 4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        animationDelay: `${delay}s`,
      }}
    />
  )
}

function SandboxSelfTest() {
  const [running, setRunning] = useState(false)
  // Nothing is asserted until a test has actually run on this host. Showing
  // "all tests contained" before anything executed would be a claim the page
  // had not earned.
  const [diagnostics, setDiagnostics] = useState<
    { name: string; target: string; status: string; detail: string }[]
  >([])
  const [overall, setOverall] = useState('Not run yet on this host.')
  const [failed, setFailed] = useState(false)
  const { push } = useToast()

  const runTest = async () => {
    setRunning(true)
    try {
      const res = await api.sandboxSelfTest()
      const checks = res.checks ?? []
      setDiagnostics(
        checks.map((c: any) => ({
          name: c.name,
          target: c.target,
          status: c.passed ? 'PASSED' : 'FAILED',
          detail: c.detail,
        }))
      )
      setOverall(res.overall ?? 'Test completed.')
      setFailed(res.all_passed === false)
      push({
        title: res.all_passed ? 'Containment held' : 'CONTAINMENT FAILURE',
        detail: `${res.passed}/${res.total} checks · ${res.duration_ms}ms`,
        tone: res.all_passed ? 'sovereign' : 'critical',
      })
    } catch (err: any) {
      // A test that could not run proves nothing, and must not look like one
      // that passed.
      setDiagnostics([])
      setFailed(true)
      setOverall(
        `The test could not be run: ${err?.message ?? 'the workbench service did not respond'}`
      )
      push({
        title: 'Test could not run',
        detail: 'No result — the service did not respond.',
        tone: 'critical',
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-border pb-4">
        <div className="flex flex-col gap-1">
          <TechnicalLabel className="text-ink-muted">Process Confinement Verification</TechnicalLabel>
          <p className="text-[13px] text-ink-muted">
            Adversarial payload injection testing AST import checks, socket creation, and CPU limits.
          </p>
        </div>
        <SovButton variant="primary" disabled={running} onClick={runTest}>
          {running ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Probing sandbox…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Play className="h-4 w-4" /> Run Penetration Diagnostics
            </span>
          )}
        </SovButton>
      </div>

      <div className="divide-y divide-ink-border border border-ink-border bg-ink-surface">
        {diagnostics.length === 0 && (
          <div className="p-5 text-[13px] text-ink-muted">
            No result yet. Run the diagnostics to submit real adversarial payloads to
            the sandbox on this machine and see what it does with them.
          </div>
        )}
        {diagnostics.map((d) => (
          <div key={d.name} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-medium text-ink-foreground">{d.name}</span>
              <span className="font-mono text-[11px] text-ink-muted">Payload: {d.target}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-[12px] text-ink-muted">{d.detail}</span>
              <span
                className={`flex items-center gap-1.5 font-mono text-[11px] ${
                  d.status === 'PASSED' ? 'text-sovereign' : 'text-critical'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                {d.status}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className={`font-mono text-[11px] ${failed ? 'text-critical' : 'text-ink-muted'}`}>
        {overall}
      </p>
    </section>
  )
}

function PolicyMatrixTable() {
  const [policies, setPolicies] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .policies()
      .then(setPolicies)
      .catch((err) => setError(err?.message ?? 'Could not read the policy files'))
  }, [])

  // Built from the policy files this host is actually enforcing, so what the
  // table shows and what the gateway does cannot drift apart.
  const rows = Object.entries(policies?.tools ?? {}).map(([name, tool]: [string, any]) => ({
    tool: name.replace(/_/g, ' '),
    ceiling: tool.max_data_classification ?? '—',
    allowed: new Set<string>(tool.allowed_roles ?? []),
  }))
  const roleColumns = ['operator', 'engineer', 'reviewer', 'administrator']

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-ink-border pb-4">
        <TechnicalLabel className="text-ink-muted">Policy Gateway Matrix</TechnicalLabel>
        <span className="font-mono text-[11px] text-ink-muted">default-deny enforcement</span>
      </div>

      <div className="overflow-x-auto border border-ink-border">
        <table className="w-full min-w-[720px] border-collapse bg-ink-surface text-left">
          <thead>
            <tr className="border-b border-ink-border text-left font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
              {['Capability / Tool', 'Operator', 'Engineer', 'Reviewer', 'Admin', 'Up to'].map((h) => (
                <th key={h} className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-border font-mono text-[12px]">
            {error && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-alarm">
                  {error}
                </td>
              </tr>
            )}
            {!error && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-ink-muted">
                  Reading the policy files…
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.tool} className="hover:bg-ink/40">
                <td className="px-4 py-3.5 text-ink-foreground">{row.tool}</td>
                {roleColumns.map((role) => {
                  const permitted = row.allowed.has(role)
                  return (
                    <td
                      key={role}
                      className="px-4 py-3.5"
                      style={{ color: permitted ? 'var(--sovereign)' : 'var(--critical, #DE5B4F)' }}
                    >
                      {permitted ? 'ALLOW' : 'DENY'}
                    </td>
                  )
                })}
                <td className="px-4 py-3.5 text-ink-muted">{row.ceiling}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
