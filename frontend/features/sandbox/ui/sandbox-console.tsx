'use client'

import { useEffect, useState } from 'react'
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

function PresetChip({
  preset,
  active,
  onClick,
}: {
  preset: SandboxPreset
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={preset.expectation}
      className={cn(
        'rounded-[var(--radius-sm-token)] border px-2.5 py-1 text-meta transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
        active
          ? 'border-foreground bg-surface-sunken text-foreground'
          : 'border-border bg-surface text-foreground-secondary hover:bg-surface-sunken',
      )}
    >
      {preset.kind === 'adversarial' && <span className="mr-1 text-critical-text" aria-hidden>▲</span>}
      {preset.label}
    </button>
  )
}

export function SandboxConsole() {
  const [code, setCode] = useState(SANDBOX_PRESETS[1].code)
  const [activePreset, setActivePreset] = useState<string | null>(SANDBOX_PRESETS[1].id)
  const [classification, setClassification] = useState<Sensitivity>('normal')
  const [limits, setLimits] = useState<SandboxLimits | null>(null)
  const [response, setResponse] = useState<SandboxExecuteResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [execError, setExecError] = useState<string | null>(null)

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
    try {
      setResponse(await executeInSandbox(code, classification))
    } catch (err) {
      setResponse(null)
      setExecError(friendlyError(err))
    } finally {
      setRunning(false)
    }
  }

  const benign = SANDBOX_PRESETS.filter((p) => p.kind === 'benign')
  const adversarial = SANDBOX_PRESETS.filter((p) => p.kind === 'adversarial')
  const activeExpectation = SANDBOX_PRESETS.find((p) => p.id === activePreset)?.expectation

  return (
    <div className="relative">
      <PageHeader
        eyebrow="Secure Execution Sandbox"
        title={
          <>
            Run it.
            <br />
            Watch it contain it.
          </>
        }
        description="Submit a payload and see exactly what the sandbox on this host does with it — the rule that rejected it, or the CPU, memory and termination it measured. Every figure below was read back from this machine."
        meta={[
          { label: 'Backend', value: limits ? limits.backend : '—' },
          { label: 'Memory cap', value: limits ? `${limits.memory_mb} MB` : '—' },
          { label: 'CPU cap', value: limits ? `${limits.cpu_seconds} s` : '—' },
          {
            label: 'Execution',
            value: limits ? (limits.execution_allowed ? 'enabled' : 'refused') : '—',
          },
        ]}
      />

      <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-5 py-10 lg:px-10 lg:py-14">
        {limits && !limits.execution_allowed && (
          <div className="border border-approval-border bg-approval-surface p-4">
            <p className="text-body text-approval-text">{limits.reason}</p>
            <p className="mt-1 text-meta text-foreground-muted">
              The console still shows what would be refused; nothing is executed while the host
              cannot enforce its limits.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Editor + payloads + the single filled action for this context. */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                Benign payloads
              </span>
              <div className="flex flex-wrap gap-2">
                {benign.map((p) => (
                  <PresetChip key={p.id} preset={p} active={p.id === activePreset} onClick={() => pickPreset(p)} />
                ))}
              </div>
              <span className="mt-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                Adversarial payloads
              </span>
              <div className="flex flex-wrap gap-2">
                {adversarial.map((p) => (
                  <PresetChip key={p.id} preset={p} active={p.id === activePreset} onClick={() => pickPreset(p)} />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
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
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    run()
                  }
                }}
                spellCheck={false}
                rows={16}
                placeholder="# Write Python, or pick a payload above."
                className="w-full resize-y rounded-[var(--radius-sm-token)] border border-border bg-surface-sunken p-3 font-mono text-meta leading-[var(--lh-body)] text-foreground placeholder:text-foreground-muted focus:shadow-[var(--focus-ring)] focus:outline-none"
              />
              {activeExpectation && (
                <p className="text-meta text-foreground-muted">Expected: {activeExpectation}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-meta text-foreground-secondary">
                <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                  Data class
                </span>
                <select
                  value={classification}
                  onChange={(e) => setClassification(e.target.value as Sensitivity)}
                  className="rounded-[var(--radius-sm-token)] border border-border bg-surface px-2 py-1 font-mono text-meta text-foreground focus:shadow-[var(--focus-ring)] focus:outline-none"
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="primary"
                icon={Play}
                busy={running}
                busyLabel="Running…"
                disabled={!code.trim()}
                onClick={run}
              >
                Run in sandbox
              </Button>
            </div>
            <p className="text-meta text-foreground-muted">
              Runs through the same policy gateway, static validator and audit trail as an agent
              tool call. ⌘/Ctrl + Enter to run.
            </p>
          </div>

          {/* What actually happened. */}
          <ResultPanel response={response} error={execError} running={running} />
        </div>

        <SelfTestPanel />
      </div>
    </div>
  )
}
