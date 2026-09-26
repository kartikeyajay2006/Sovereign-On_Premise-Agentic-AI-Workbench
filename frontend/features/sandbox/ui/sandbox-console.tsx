'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/shared/ui/controls/button'
import { ApiError } from '@/lib/api'
import type { Sensitivity } from '@/lib/types'
import { cn } from '@/lib/utils'
import { executeInSandbox, getSandboxLimits } from '../model/api'
import { SANDBOX_PRESETS, type SandboxPreset } from '../model/presets'
import type { SandboxExecuteResponse, SandboxLimits } from '../model/types'
import { ResultPanel } from './result-panel'
import { SelfTestPanel } from './self-test-panel'
import { sandboxMechanism } from '@/lib/presentation'

const CLASSIFICATIONS: Sensitivity[] = ['normal', 'confidential', 'sensitive', 'restricted']

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return `Refused by policy: ${err.detail || 'this role may not run code here.'}`
    if (err.status === 413) return String(err.detail || 'That payload is larger than the console accepts.')
    if (err.status === 429) return String(err.detail || 'The sandbox is busy. Try again in a moment.')
    if (err.status === 401) return 'Your session has expired. Sign in again.'
    return err.detail ? String(err.detail) : err.message
  }
  return 'Cannot reach the local workbench service.'
}

/** One payload in the list: what it is, and what the host should do with it. */
function PresetRow({ preset, active, onClick }: { preset: SandboxPreset; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'grid w-full grid-cols-[10px_minmax(0,1fr)] items-baseline gap-x-2.5 rounded-[12px] px-3 py-2 text-left transition-colors',
          'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
          active ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 translate-y-[-1px] rounded-full',
            preset.kind === 'adversarial' ? 'bg-critical' : 'bg-sovereign',
          )}
        />
        <span className="min-w-0">
          <span className={cn('block text-[13.5px]', active ? 'font-medium text-foreground' : 'text-foreground-secondary')}>
            {preset.label}
          </span>
          <span title={preset.expectation} className="mt-0.5 block truncate text-[12px] leading-[1.45] text-foreground-muted">
            {preset.expectation}
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * The sandbox, as the thing it is: an editor, a run button, and what the
 * host did with the code.
 *
 * Payloads down the side -- the ordinary work first, then the attacks each
 * control exists to stop -- the code in the middle with its line numbers,
 * and under it the run as a transcript: refused and why, or completed or
 * contained and everything the host measured doing it. No figure on the page
 * is written by the page; each is read back from this machine.
 */
export function SandboxConsole() {
  const [code, setCode] = useState(SANDBOX_PRESETS[1].code)
  const [activePreset, setActivePreset] = useState<string | null>(SANDBOX_PRESETS[1].id)
  const [classification, setClassification] = useState<Sensitivity>('normal')
  const [limits, setLimits] = useState<SandboxLimits | null>(null)
  const [response, setResponse] = useState<SandboxExecuteResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [execError, setExecError] = useState<string | null>(null)
  const [ranCode, setRanCode] = useState<string | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    getSandboxLimits()
      .then(setLimits)
      .catch(() => setLimits(null))
  }, [])

  const pickPreset = (preset: SandboxPreset) => {
    setCode(preset.code)
    setActivePreset(preset.id)
  }

  const run = async () => {
    if (!code.trim() || running) return
    setRunning(true)
    setExecError(null)
    setRanCode(code)
    try {
      setResponse(await executeInSandbox(code, classification))
    } catch (err) {
      setResponse(null)
      setExecError(friendlyError(err))
    } finally {
      setRunning(false)
    }
  }

  const work = SANDBOX_PRESETS.filter((p) => p.kind === 'benign')
  const attacks = SANDBOX_PRESETS.filter((p) => p.kind === 'adversarial')
  const preset = SANDBOX_PRESETS.find((p) => p.id === activePreset) ?? null
  const lineCount = useMemo(() => Math.max(1, code.split('\n').length), [code])

  return (
    <div className="pb-16">
      <PageHeader
        title="Sandbox"
        description="Run Python under this host's limits and see exactly what it did — through the same gateway, checks and audit trail as an agent's own code."
        meta={[
          { label: 'Runtime', value: limits ? limits.runtime : '—', hint: limits?.configured_runtime && `configured: ${limits.configured_runtime}` },
          { label: 'Limits enforced by', value: limits ? sandboxMechanism(limits.backend) : '—', hint: limits?.backend },
          { label: 'Memory', value: limits ? `≤ ${limits.memory_mb} MB` : '—' },
          { label: 'CPU', value: limits ? `≤ ${limits.cpu_seconds} s` : '—' },
          {
            label: 'Execution',
            value: limits ? (limits.execution_allowed ? 'enabled' : 'refused') : '—',
            tone: limits ? (limits.execution_allowed ? 'sovereign' : 'approval') : 'default',
          },
        ]}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 pt-6 sm:px-6">
        {/* A container runtime was asked for and its probe did not prove the
            isolation: say why, and what the host does instead, rather than
            letting "subprocess" in the header read as the configured choice. */}
        {limits?.container && !limits.container.usable && (
          <div className="rounded-[16px] bg-approval-surface px-4 py-3">
            <p className="text-[14px] text-approval-text">
              {limits.container.runtime} container not in use: {limits.container.reason}
            </p>
            <p className="mt-1 text-[12.5px] text-foreground-muted">
              {limits.container.fallback === 'subprocess'
                ? 'Code runs in the subprocess sandbox instead, and every result says so.'
                : 'Execution is refused until the container probe passes.'}
            </p>
          </div>
        )}

        {limits && !limits.execution_allowed && (
          <div className="rounded-[16px] bg-approval-surface px-4 py-3">
            <p className="text-[14px] text-approval-text">{limits.reason}</p>
            <p className="mt-1 text-[12.5px] text-foreground-muted">
              What would be refused is still shown; nothing is executed while the host cannot enforce its limits.
            </p>
          </div>
        )}

        <div className="grid overflow-hidden rounded-[22px] border border-line-subtle bg-surface lg:grid-cols-[264px_minmax(0,1fr)]">
          {/* The payloads: what real work looks like, then what each control is for. */}
          <nav aria-label="Payloads" className="border-b border-line-subtle p-2.5 lg:border-b-0 lg:border-r">
            <p className="px-3 pb-1 pt-2 text-[12px] font-medium text-foreground-muted">Work</p>
            <ul className="flex flex-col gap-0.5">
              {work.map((p) => (
                <PresetRow key={p.id} preset={p} active={p.id === activePreset} onClick={() => pickPreset(p)} />
              ))}
            </ul>
            <p className="px-3 pb-1 pt-4 text-[12px] font-medium text-foreground-muted">Attacks it must stop</p>
            <ul className="flex flex-col gap-0.5">
              {attacks.map((p) => (
                <PresetRow key={p.id} preset={p} active={p.id === activePreset} onClick={() => pickPreset(p)} />
              ))}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col">
            {/* The editor's bar: the file, what it is classified as, and Run. */}
            <div className="flex flex-wrap items-center gap-3 border-b border-line-subtle px-4 py-2.5">
              <span className="font-mono text-[12.5px] text-foreground-secondary">payload.py</span>
              {preset && (
                <span
                  className={cn(
                    'rounded-full px-2 text-[11.5px] leading-5',
                    preset.kind === 'adversarial' ? 'bg-critical-surface text-critical-text' : 'bg-sovereign-surface text-sovereign-text',
                  )}
                >
                  {preset.kind === 'adversarial' ? 'attack' : 'work'}
                </span>
              )}
              <label className="ml-auto flex items-center gap-2 text-[12.5px] text-foreground-muted">
                Data class
                <select
                  value={classification}
                  onChange={(e) => setClassification(e.target.value as Sensitivity)}
                  className="h-8 rounded-full border border-line-subtle bg-surface px-3 text-[12.5px] text-foreground focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="primary" size="sm" icon={Play} busy={running} busyLabel="Running…" disabled={!code.trim()} onClick={run}>
                Run
              </Button>
            </div>

            <div className="flex max-h-[420px] min-h-[260px] overflow-hidden bg-surface-sunken/50">
              <div
                ref={gutterRef}
                aria-hidden
                className="shrink-0 select-none overflow-hidden py-3 pl-4 pr-3 text-right font-mono text-[12.5px] leading-[1.7] text-foreground-muted/70"
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <label htmlFor="sandbox-code" className="sr-only">
                Python to run in the sandbox
              </label>
              <textarea
                id="sandbox-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  setActivePreset(null)
                }}
                onScroll={(e) => {
                  if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    void run()
                  }
                }}
                spellCheck={false}
                wrap="off"
                placeholder="# Write Python, or pick a payload."
                className="min-w-0 flex-1 resize-none overflow-auto bg-transparent py-3 pr-4 font-mono text-[12.5px] leading-[1.7] text-foreground placeholder:text-foreground-muted focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle px-4 py-2 text-[12px] text-foreground-muted">
              <span>{preset ? `Expected: ${preset.expectation}` : 'Your own code: the validator reads it before anything runs.'}</span>
              <span>Ctrl + Enter to run</span>
            </div>

            <ResultPanel response={response} error={execError} running={running} code={ranCode} />
          </div>
        </div>

        <SelfTestPanel />
      </div>
    </div>
  )
}
