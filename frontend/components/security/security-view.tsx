'use client'

import { useEffect, useState } from 'react'
import {
  Check,
  Loader2,
  Play,
  Network,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SandboxTestResult, SovereigntyStatus } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { SectionHeading, TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { useToast } from '@/components/toast'
import { useEventStream } from '@/hooks/use-event-stream'
import { cn } from '@/lib/utils'

/**
 * Unused, and deliberately not revived in this form.
 *
 * These are the fill hues. Applied to a policy verdict as text they were
 * 3.07:1, 4.50:1 and 2.97:1 on paper — the last of which fails even the 3:1
 * threshold for non-text. A policy matrix whose ALLOW and DENY columns
 * cannot be read is worse than one with no colour at all, because it looks
 * like it is telling you something.
 *
 * Anything rendering a verdict should use the -text variants and a glyph, so
 * it survives greyscale and a projector: text-sovereign-text,
 * text-critical-text, text-approval-text.
 */


export function SecurityView() {
  const [status, setStatus] = useState<SovereigntyStatus | null>(null)
  const [uptimeStr, setUptimeStr] = useState('since boot')

  useEffect(() => {
    api
      .sovereigntyStatus()
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
          ...((prev || {}) as any),
          ...event.data,
        }))
      }
    },
  })

  return (
    <div className="relative">
      {/*
        The header used to read "External egress is structurally impossible"
        above the strings CONTAINED and DENY-ALL, and Posture resolved to
        SOVEREIGN whenever status was null — so a backend that never answered
        presented as a proven-sovereign host.

        None of that was structural. Generated code runs as a subprocess under
        the same OS user, with no container, no network namespace and no
        firewall rule. What exists is an AST review before execution and a
        socket shim inside the interpreter: two defeatable checks, not an
        impossibility. Every figure here is now read from the API, and an
        absent reading shows as an em dash rather than a favourable default.
      */}
      <PageHeader
        eyebrow="Air-Gapped Security Architecture"
        title={
          <>
            Nothing leaves
            <br />
            this host.
          </>
        }
        description="Inference, retrieval and code execution run on this host. Outbound connections are reviewed before execution and sampled at runtime; the figures below are what this host measured, not a guarantee."
        meta={[
          {
            label: 'External calls',
            value: status ? String(status.external_api_calls) : '—',
          },
          {
            label: 'Egress monitor',
            value: status ? (status.monitor_active ? 'active' : 'inactive') : '—',
          },
          {
            label: 'Unapproved connections',
            value: status ? String(status.unapproved_connections) : '—',
          },
          {
            label: 'Posture',
            value: status ? (status.sovereign ? 'SOVEREIGN' : 'INVESTIGATE') : 'UNKNOWN',
          },
        ]}
      />

      <div className="mx-auto flex max-w-[1400px] flex-col gap-12 px-5 py-10 lg:px-10 lg:py-14">
        <ExternalCallsHero status={status} uptimeStr={uptimeStr} />
        <ConnectionTelemetry status={status} />
        <SandboxSelfTest />
        <PolicyMatrixTable />
      </div>
    </div>
  )
}

function ExternalCallsHero({ status, uptimeStr }: { status: SovereigntyStatus | null; uptimeStr: string }) {
  // The single largest number on the security screen. It read
  // `status?.external_api_calls ?? 0`, so a backend that never answered
  // rendered an eight-storey zero — the most reassuring figure in the product,
  // shown precisely when nothing was being measured at all.
  const externalCalls = status?.external_api_calls ?? null

  return (
    <section className="relative overflow-hidden border border-border bg-surface p-8 shadow-sm lg:p-12">
      <div className="pointer-events-none absolute inset-0 tech-grid opacity-30" />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor:
                externalCalls === null ? 'var(--foreground-muted)' : 'var(--sovereign)',
            }}
          />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground-muted">
            Outbound Network Telemetry
          </span>
        </div>

        <div className="flex items-baseline gap-4">
          <span
            className="font-mono font-bold tracking-tight md:text-8xl"
            style={{
              fontSize: externalCalls === null ? '2.25rem' : undefined,
              color:
                externalCalls === null ? 'var(--foreground-muted)' : 'var(--foreground)',
            }}
          >
            {externalCalls === null ? 'no reading' : externalCalls}
          </span>
          <div className="flex flex-col items-start text-left">
            <span className="font-mono text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--sovereign)]">
              External calls
            </span>
            <span className="font-mono text-[11px] text-foreground-muted">{uptimeStr}</span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 rounded-full border border-border bg-surface-sunken/60 px-4 py-1.5 font-mono text-[12px] text-foreground-secondary">
          <span className="relative flex h-2 w-2">
            <span className="sov-pulse absolute inline-flex h-full w-full rounded-full bg-[var(--sovereign)]" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--sovereign)]" />
          </span>
          {/*
            These were the literals "0 outbound sockets opened · 0 bytes
            egressed", printed beside live status the component already had in
            hand. A reader could not tell which number on the row was measured.
          */}
          <span>
            {status
              ? `${status.unapproved_connections} unapproved · ${status.data_leaving_host_bytes} bytes recorded`
              : 'No reading from the egress monitor'}
          </span>
          <span className="text-foreground-muted">·</span>
          <span className="font-medium">
            {status?.monitor_active ? 'Monitor active' : 'Monitor inactive'}
          </span>
        </div>
      </div>
    </section>
  )
}

function ConnectionTelemetry({ status }: { status: SovereigntyStatus | null }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <SectionHeading index="01" title="Active Socket Listener Telemetry" />
        <span className="font-mono text-[11px] text-foreground-muted">
          127.0.0.1 loopback only
        </span>
      </div>

      {/*
        Two of the three tiles here were configuration, not measurement.
        "Bound Address 127.0.0.1:8000" and "Frontend Proxy 127.0.0.1:3000"
        were set in --sovereign and --active as TEXT — 3.07:1 and 3.82:1 on
        paper, the exact failure the token set exists to fix — and each
        carried a claim the page cannot check: that the process is "strictly
        bound to the local loopback interface". This build knows which
        address it is configured to call. It does not know what the process
        is bound to, and a browser cannot find out.

        So they are demoted from metric tiles to a configuration line, in
        ink, labelled as configuration. Only the egress figure is a reading,
        and it keeps the caption describing how it was taken.
      */}
      <dl className="flex flex-wrap gap-x-8 gap-y-2 border border-line-default bg-surface px-5 py-3">
        <div className="flex items-baseline gap-2">
          <dt className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            API configured at
          </dt>
          <dd className="font-mono text-meta text-foreground">127.0.0.1:8000</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            Interface served from
          </dt>
          <dd className="font-mono text-meta text-foreground">127.0.0.1:3000</dd>
        </div>
      </dl>

      <div className="border border-line-default bg-surface p-5">
        <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          Unapproved outbound connections
        </span>
        <div
          className={cn(
            'mt-2 tabular font-mono text-title font-medium',
            status === null
              ? 'text-foreground-muted'
              : status.unapproved_connections > 0
                ? 'text-critical-text'
                : 'text-sovereign-text',
          )}
        >
          {status === null ? 'no reading' : status.unapproved_connections}
        </div>
        {/*
          The caption used to say the monitor had "verified 0 egress". It
          verifies nothing of the sort: it samples connections belonging to
          the API process tree every couple of seconds, so a connection that
          opens and closes between samples is never seen, and it fails open —
          when it cannot read the connection table it reports an empty list,
          which is indistinguishable from clean.
        */}
        <p className="mt-1.5 max-w-[66ch] text-ui leading-[var(--lh-body)] text-foreground-secondary">
          Sampled from the API process tree every 2 seconds. Connections that
          open and close between samples are not observed, and a monitor that
          cannot read the connection table reports an empty list.
        </p>
      </div>
    </section>
  )
}

function SandboxSelfTest() {
  const [running, setRunning] = useState(false)
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
      // Three outcomes, not two. A host that refuses to execute submitted no
      // payload, so it has neither held nor failed -- and painting that red
      // accuses the product of a breach it did not have.
      const assessable = (res as any).assessable !== false
      setDiagnostics(
        checks.map((c: any) => ({
          name: c.name,
          target: c.target,
          status: c.passed ? 'PASSED' : 'FAILED',
          detail: c.detail,
        }))
      )
      setOverall(
        [res.overall, assessable ? '' : (res as any).reason].filter(Boolean).join(' ') ||
          'Test completed.'
      )
      setFailed(assessable && res.all_passed === false)
      push({
        title: !assessable
          ? 'Not assessable on this host'
          : res.all_passed
            ? 'Containment held'
            : 'CONTAINMENT FAILURE',
        detail: assessable
          ? `${res.passed}/${res.total} checks · ${res.duration_ms}ms`
          : 'No payload was submitted, so no claim is made either way.',
        tone: !assessable ? 'default' : res.all_passed ? 'sovereign' : 'critical',
      })
    } catch (err: any) {
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
    <section className="flex flex-col gap-4 border border-border bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <SectionHeading index="02" title="Process Confinement Verification" />
          <p className="text-[13px] text-foreground-secondary">
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

      <div className="divide-y divide-border border border-border bg-surface">
        {diagnostics.length === 0 && (
          <div className="p-5 text-[13px] text-foreground-secondary">
            No result yet. Run the diagnostics to submit real adversarial payloads to
            the sandbox on this machine and see what it does with them.
          </div>
        )}
        {diagnostics.map((d) => (
          <div key={d.name} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-surface-sunken/50 transition-colors">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-foreground">{d.name}</span>
              <span className="font-mono text-[11px] text-foreground-muted">Payload: {d.target}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-[12px] text-foreground-secondary">{d.detail}</span>
              <span
                className={cn(
                  'flex items-center gap-1.5 font-mono text-[11px] font-semibold',
                  d.status === 'PASSED' ? 'text-[var(--sovereign)]' : 'text-critical'
                )}
              >
                <Check className="h-3.5 w-3.5" />
                {d.status}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className={cn('font-mono text-[11px]', failed ? 'text-critical' : 'text-foreground-muted')}>
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

  const rows = Object.entries(policies?.tools ?? {}).map(([name, tool]: [string, any]) => ({
    tool: name.replace(/_/g, ' '),
    ceiling: tool.max_data_classification ?? '—',
    allowed: new Set<string>(tool.allowed_roles ?? []),
  }))
  const roleColumns = ['operator', 'engineer', 'reviewer', 'administrator']

  return (
    <section className="flex flex-col gap-4 border border-border bg-surface p-6 sm:p-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <SectionHeading index="03" title="Policy Gateway Matrix" />
        <span className="font-mono text-[11px] text-foreground-muted">default-deny enforcement</span>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] border-collapse bg-surface text-left">
          <thead>
            <tr className="border-b border-border bg-surface-sunken/60 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
              {['Capability / Tool', 'Operator', 'Engineer', 'Reviewer', 'Admin', 'Up to'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-mono text-[12px]">
            {error && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-critical">
                  {error}
                </td>
              </tr>
            )}
            {!error && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-foreground-muted">
                  Reading the policy files…
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.tool} className="hover:bg-surface-sunken/40 transition-colors">
                <td className="px-4 py-3.5 font-medium text-foreground">{row.tool}</td>
                {roleColumns.map((role) => {
                  const permitted = row.allowed.has(role)
                  return (
                    <td
                      key={role}
                      className="px-4 py-3.5 font-semibold"
                      style={{ color: permitted ? 'var(--sovereign)' : 'var(--critical)' }}
                    >
                      {permitted ? 'ALLOW' : 'DENY'}
                    </td>
                  )
                })}
                <td className="px-4 py-3.5 text-foreground-muted uppercase">{row.ceiling}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
