'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, Eye, Play } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useRole } from '@/components/role-context'
import { Append, AppendScope, MeasuredNumber } from '@/shared/motion'
import { Button } from '@/shared/ui/controls/button'
import { ErrorState } from '@/shared/ui/data/error-state'
import { harnessApi } from '../api'
import type {
  HarnessDefinitionView,
  HarnessInputView,
  HarnessPreview,
  InputValue,
  PreviewItem,
} from '../model/types'
import { Ledger, Notice, Panel } from './parts'
import { plural } from './format'

// ------------------------------------------------------------ prefill
// "Run again with these inputs" hands the inputs across in session storage:
// twenty-five questions do not fit in a URL. Storage can be unavailable or
// cleared, so every access is guarded and a miss simply means a blank form.
const prefillKey = (harnessId: string) => `aegis.harness.prefill.${harnessId}`

export function writePrefill(harnessId: string, inputs: Record<string, InputValue>): void {
  try {
    window.sessionStorage.setItem(prefillKey(harnessId), JSON.stringify(inputs))
  } catch {
    // A blank form is the honest fallback.
  }
}

function takePrefill(harnessId: string): Record<string, InputValue> | null {
  try {
    const raw = window.sessionStorage.getItem(prefillKey(harnessId))
    if (!raw) return null
    window.sessionStorage.removeItem(prefillKey(harnessId))
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, InputValue>) : null
  } catch {
    return null
  }
}

function initialValues(
  definition: HarnessDefinitionView,
  prefill: Record<string, InputValue> | null,
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const input of definition.inputs) {
    const prior = prefill?.[input.id]
    if (Array.isArray(prior)) values[input.id] = prior.join('\n')
    else if (typeof prior === 'string') values[input.id] = prior
    else values[input.id] = input.kind === 'choice' ? (input.default ?? '') : ''
  }
  return values
}

/** What the browser can see about an input before the server has checked it. */
function inputProblem(input: HarnessInputView, raw: string): string | null {
  if (input.kind === 'lines') {
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
    if (input.required && lines.length === 0) return null // said by the counter
    if (lines.length > input.max_items) {
      return `${lines.length} lines; one run takes at most ${input.max_items}.`
    }
    const long = lines.findIndex((line) => line.length > input.max_chars)
    if (long !== -1) {
      return `Line ${long + 1} is ${lines[long].length} characters; the limit is ${input.max_chars}.`
    }
    return null
  }
  if (input.kind === 'text' && raw.trim().length > input.max_chars) {
    return `${raw.trim().length} characters; the limit is ${input.max_chars}.`
  }
  return null
}

const FIELD =
  'hover-decay w-full rounded-[var(--radius)] bg-surface text-body text-foreground shadow-[0_0_0_1px_var(--control-default)] outline-none placeholder:text-foreground-muted hover:shadow-[0_0_0_1px_var(--control-strong)] focus:shadow-[var(--focus-halo)] disabled:opacity-[var(--opacity-disabled)]'

function InputField({
  input,
  value,
  onChange,
  disabled,
}: {
  input: HarnessInputView
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const id = `harness-input-${input.id}`
  const problem = inputProblem(input, value)
  const lineCount =
    input.kind === 'lines' ? value.split('\n').filter((line) => line.trim()).length : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ui font-medium text-foreground-secondary">
          {input.label}
          {!input.required && <span className="ml-1.5 font-normal text-foreground-muted">optional</span>}
        </label>
        {input.kind === 'lines' && (
          <span
            className={cn(
              'tabular font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
              lineCount > input.max_items ? 'text-critical-text' : 'text-foreground-muted',
            )}
          >
            {lineCount} of {input.max_items} · one run each
          </span>
        )}
      </div>

      {input.kind === 'choice' ? (
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={cn(FIELD, 'h-[var(--control-md)] px-2.5')}
        >
          {/* Without an empty option a browser shows the first choice while
              the state holds none, and the preview would be made from a
              different value than the one on screen. */}
          {(!input.required || !value) && (
            <option value="" disabled={input.required}>
              {input.required ? 'Choose…' : '—'}
            </option>
          )}
          {input.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : input.kind === 'lines' || input.max_chars > 160 ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          rows={input.kind === 'lines' ? 9 : 2}
          placeholder={input.placeholder ?? undefined}
          spellCheck
          className={cn(FIELD, 'resize-y px-3 py-2.5 leading-[var(--lh-body)]')}
          aria-describedby={input.help ? `${id}-help` : undefined}
          aria-invalid={problem ? true : undefined}
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder={input.placeholder ?? undefined}
          className={cn(FIELD, 'h-[var(--control-md)] px-2.5')}
          aria-describedby={input.help ? `${id}-help` : undefined}
          aria-invalid={problem ? true : undefined}
        />
      )}

      {problem ? (
        <p className="text-ui text-critical-text">{problem}</p>
      ) : input.help ? (
        <p id={`${id}-help`} className="text-ui text-foreground-muted">
          {input.help}
        </p>
      ) : null}
    </div>
  )
}

function PreviewRow({
  item,
  checked,
  onToggle,
}: {
  item: PreviewItem
  checked: boolean
  onToggle: () => void
}) {
  return (
    // APPEND: the preview response. These are the exact prompts that would
    // be submitted, arriving in index order; a prompt already on screen
    // from an earlier preview of the same inputs stays still.
    <Append as="li" index={item.index} className="grouped-row last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Include item ${item.index}: ${item.label}`}
          className="mt-1 size-3.5 shrink-0 accent-[var(--foreground)]"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span className="tabular w-6 shrink-0 font-mono text-meta text-foreground-muted">
              {item.index}
            </span>
            <span className={cn('min-w-0 text-body', checked ? 'text-foreground' : 'text-foreground-muted line-through')}>
              {item.label}
            </span>
          </span>
          <details className="group ml-8">
            <summary className="cursor-pointer list-none font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted hover:text-foreground-secondary focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none">
              <span className="group-open:hidden">Show the exact prompt</span>
              <span className="hidden group-open:inline">Hide the prompt</span>
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words border-l-2 border-line-strong bg-surface-sunken px-3 py-2 font-mono text-meta text-foreground-secondary">
              {item.prompt}
            </pre>
          </details>
        </div>
      </div>
    </Append>
  )
}

export interface HarnessConfigureProps {
  harnessId: string
  onBack: () => void
  onStarted: (runId: string) => void
}

export function HarnessConfigure({ harnessId, onBack, onStarted }: HarnessConfigureProps) {
  const { user, role } = useRole()
  const canCreate = Boolean(user?.permissions?.includes('task.create'))

  const [definition, setDefinition] = useState<HarnessDefinitionView | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<HarnessPreview | null>(null)
  const [previewedFor, setPreviewedFor] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewing, setPreviewing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [actionError, setActionError] = useState<ApiError | null>(null)

  useEffect(() => {
    let live = true
    setDefinition(null)
    setPreview(null)
    harnessApi
      .definition(harnessId)
      .then((loaded) => {
        if (!live) return
        setDefinition(loaded)
        setValues(initialValues(loaded, takePrefill(harnessId)))
      })
      .catch((err) => live && setLoadError(err instanceof ApiError ? err : new ApiError(0, String(err))))
    return () => {
      live = false
    }
  }, [harnessId])

  const fingerprint = JSON.stringify(values)
  // A preview describes the inputs it was made from. Once they change it
  // describes something else, so it can no longer be started from.
  const stale = preview !== null && previewedFor !== fingerprint
  const selectedCount = preview ? preview.items.filter((item) => selected.has(item.key)).length : 0
  const overLimit = preview !== null && selectedCount > preview.limit
  const hasProblem = definition?.inputs.some((input) => inputProblem(input, values[input.id] ?? '')) ?? false
  const canStart =
    canCreate && preview !== null && !stale && selectedCount > 0 && !overLimit && !starting && !hasProblem

  const groups = useMemo(() => {
    if (!preview) return []
    const order: string[] = []
    const byGroup = new Map<string, PreviewItem[]>()
    for (const item of preview.items) {
      const key = item.group ?? ''
      if (!byGroup.has(key)) {
        byGroup.set(key, [])
        order.push(key)
      }
      byGroup.get(key)!.push(item)
    }
    return order.map((key) => ({ group: key, items: byGroup.get(key)! }))
  }, [preview])

  const runPreview = async () => {
    if (!definition || !canCreate) return
    setPreviewing(true)
    setActionError(null)
    try {
      const result = await harnessApi.preview(definition.id, { inputs: values })
      setPreview(result)
      setPreviewedFor(JSON.stringify(values))
      setSelected(new Set(result.items.slice(0, result.limit).map((item) => item.key)))
    } catch (err) {
      setActionError(err instanceof ApiError ? err : new ApiError(0, String(err)))
    } finally {
      setPreviewing(false)
    }
  }

  const start = async () => {
    if (!definition || !preview || !canStart) return
    setStarting(true)
    setActionError(null)
    try {
      const run = await harnessApi.start({
        harness_id: definition.id,
        inputs: values,
        selected: preview.items.filter((item) => selected.has(item.key)).map((item) => item.key),
        definition_sha256: definition.sha256,
      })
      onStarted(run.id)
    } catch (err) {
      setActionError(err instanceof ApiError ? err : new ApiError(0, String(err)))
      setStarting(false)
    }
  }

  const onFormKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    if (!preview || stale) void runPreview()
    else void start()
  }

  const toggle = (key: string) =>
    setSelected((prior) => {
      const next = new Set(prior)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} ground="paper">
          Harnesses
        </Button>
        <ErrorState
          className="mt-6"
          headline={loadError.status === 404 ? 'That harness is not defined.' : 'The harness could not be read.'}
          nextAction="Return to the library and choose one that is listed."
          identifier={{ label: 'harness', value: harnessId }}
          detail={String(loadError.detail || loadError.message)}
        />
      </div>
    )
  }

  if (!definition) {
    return (
      <p className="mx-auto w-full max-w-[1400px] px-4 py-8 font-mono text-meta text-foreground-muted sm:px-6">
        Reading the definition…
      </p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6" onKeyDown={onFormKey}>
      <div>
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} ground="paper">
          Harnesses
        </Button>
      </div>

      <header className="flex flex-col gap-2 border-b border-line-default pb-6">
        <Ledger>Configure · {definition.source}</Ledger>
        <h1 className="text-title font-medium tracking-[var(--ls-title)] text-foreground">
          {definition.name}
        </h1>
        <p className="max-w-[80ch] text-body text-foreground-secondary">{definition.description}</p>
        <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          v{definition.version} · sha256 {definition.sha256.slice(0, 16)} ·{' '}
          {definition.report_requires_approval
            ? 'report released only after sign-off'
            : 'report released when written'}
        </p>
      </header>

      {!canCreate && (
        <Notice>
          Your role, <span className="font-mono text-foreground">{user?.role ?? role.label}</span>, does
          not hold <span className="font-mono text-foreground">task.create</span>, so it can read
          harnesses and their runs but cannot start one.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <Panel title="Inputs" id="harness-inputs">
          <div className="flex flex-col gap-5 p-4">
            {definition.inputs.map((input) => (
              <InputField
                key={input.id}
                input={input}
                value={values[input.id] ?? ''}
                onChange={(next) => setValues((prior) => ({ ...prior, [input.id]: next }))}
                disabled={!canCreate || starting}
              />
            ))}

            <details className="group">
              <summary className="cursor-pointer list-none font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted hover:text-foreground-secondary focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none">
                <span className="group-open:hidden">What each run is asked ▸</span>
                <span className="hidden group-open:inline">What each run is asked ▾</span>
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words border-l-2 border-line-strong bg-surface-sunken px-3 py-2 font-mono text-meta text-foreground-secondary">
                {definition.template}
              </pre>
              <p className="mt-2 text-ui text-foreground-muted">
                Each prompt is submitted to the task service as an ordinary run and answered in prose,
                never as a document. Classification, policy, retrieval, verification and the approval
                gate apply to each one on its own terms.
              </p>
            </details>

            <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
              <Button
                variant="secondary"
                size="md"
                icon={Eye}
                onClick={() => void runPreview()}
                disabled={!canCreate || hasProblem}
                busy={previewing}
                busyLabel="Expanding…"
              >
                {preview && !stale ? 'Preview again' : 'Preview runs'}
              </Button>
              <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                ⌘/Ctrl ↵ {preview && !stale ? 'start' : 'preview'}
              </span>
            </div>
          </div>
        </Panel>

        <Panel
          title="Preview"
          id="harness-preview"
          aside={
            preview ? (
              <span className="tabular font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                {/* ROLL: a new preview response. The selection count beside
                    it moves with checkboxes, often from the keyboard, so it
                    changes in place. */}
                <MeasuredNumber value={preview.items.length} className="text-foreground-secondary" /> prompts ·{' '}
                <span className={overLimit ? 'text-critical-text' : undefined}>
                  {selectedCount} selected · limit {preview.limit}
                </span>
              </span>
            ) : null
          }
        >
          {/* Live before any preview arrives, so the prompts a preview
              returns append rather than being read in place. */}
          <AppendScope>
          {actionError && (
            <div className="border-b border-line-subtle p-4">
              <ErrorState
                headline={
                  actionError.status === 400
                    ? 'The inputs cannot be run as given.'
                    : actionError.status === 409
                      ? 'The harness definition changed after it was opened.'
                      : 'The request was refused.'
                }
                nextAction={
                  actionError.status === 403
                    ? 'This role cannot start harness runs.'
                    : actionError.status === 409
                      ? 'Reload the page to read the current definition, then preview again.'
                      : 'Correct the inputs and preview again.'
                }
                detail={String(actionError.detail || actionError.message)}
              />
            </div>
          )}

          {!preview ? (
            <p className="px-4 py-6 text-body text-foreground-secondary">
              Preview expands the inputs into the exact prompts that would be submitted, and counts
              what your role can retrieve. Nothing runs until you start it.
            </p>
          ) : (
            <div className={cn('flex flex-col', stale && 'opacity-[var(--opacity-dim)]')}>
              <div className="flex flex-col gap-3 border-b border-line-subtle px-4 py-3">
                {stale && (
                  <p className="text-ui font-medium text-foreground">
                    The inputs changed after this preview. Preview again before starting.
                  </p>
                )}
                <p className="text-ui text-foreground-secondary">
                  Retrieval for these runs covers{' '}
                  <span className="font-mono text-foreground">
                    {preview.scope.departments === null
                      ? 'every department'
                      : preview.scope.departments.join(', ')}
                  </span>{' '}
                  up to <span className="font-mono text-foreground">{preview.scope.max_classification}</span>:{' '}
                  <span className="tabular font-mono text-foreground">
                    {plural(preview.scope.documents, 'document')}
                  </span>
                  ,{' '}
                  <span className="tabular font-mono text-foreground">
                    {plural(preview.scope.sections, 'section')}
                  </span>{' '}
                  indexed.
                </p>
                {preview.warnings.map((warning) => (
                  <p key={warning} className="flex items-start gap-2 text-ui text-foreground">
                    <span aria-hidden className="font-mono text-foreground-secondary">
                      ◇
                    </span>
                    <span className="min-w-0">{warning}</span>
                  </p>
                ))}
              </div>

              {preview.items.length === 0 ? (
                <p className="px-4 py-6 text-body text-foreground-secondary">
                  These inputs expand to no runs.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setSelected(new Set(preview.items.slice(0, preview.limit).map((item) => item.key)))}
                      className="hover-decay rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                    >
                      {preview.items.length > preview.limit ? `Select first ${preview.limit}` : 'Select all'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="hover-decay rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                    >
                      Select none
                    </button>
                  </div>
                  <div className="max-h-[56vh] overflow-y-auto">
                    {groups.map(({ group, items }) => (
                      <div key={group || 'ungrouped'}>
                        {group && (
                          <p className="sticky top-0 z-[1] border-b border-line-subtle bg-surface px-4 py-2 text-ui font-medium text-foreground-secondary">
                            {group}
                          </p>
                        )}
                        <ul role="list" className="flex list-none flex-col p-0">
                          {items.map((item) => (
                            <PreviewRow
                              key={item.key}
                              item={item}
                              checked={selected.has(item.key)}
                              onToggle={() => toggle(item.key)}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="flex flex-col gap-3 border-t border-line-subtle px-4 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    icon={Play}
                    onClick={() => void start()}
                    disabled={!canStart}
                    busy={starting}
                    busyLabel="Starting…"
                  >
                    Start {plural(selectedCount, 'run')}
                  </Button>
                  {overLimit && (
                    <span className="text-ui text-critical-text">
                      Deselect {selectedCount - preview.limit} to start; one run takes at most {preview.limit}.
                    </span>
                  )}
                </div>
                <p className="max-w-[70ch] text-ui text-foreground-muted">
                  Runs are submitted one at a time, each after the one before it settles, so a thread
                  question asked meanwhile waits behind at most one of them. Progress is shown as runs
                  settle. No finish time is estimated.
                </p>
              </div>
            </div>
          )}
          </AppendScope>
        </Panel>
      </div>
    </div>
  )
}
