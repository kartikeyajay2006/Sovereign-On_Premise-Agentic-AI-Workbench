'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { harnessApi } from '@/features/harness/api'
import type { HarnessRunSummary } from '@/features/harness/model/types'
import { api } from '@/lib/api'
import { ROLES } from '@/lib/presentation'
import type { TaskSummary } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useRole } from './role-context'
import { useToast } from './toast'
import { DESTINATIONS, NEW_RUN_EVENT, OPEN_PALETTE_EVENT, usePlatformMod } from './navigation'

/**
 * Go anywhere without the mouse.
 *
 * The workbench has seven screens and a run history that is dozens deep on
 * a demo host. Reaching a particular run meant scrolling a rail; reaching a
 * screen meant crossing the page to the header. Neither is a lot of work
 * once. Both are a lot of work when a reviewer is checking a claim against
 * its source and back again.
 *
 * It proposes nothing it cannot do. Every row is a screen that exists, a
 * run the API returned, or an action this component performs itself, so the
 * palette can never offer something the product does not have -- the
 * failure of a palette built from a hardcoded list that drifts from the app.
 * It used to offer "New run: clear the thread", and navigating to the
 * thread cleared nothing, so that promise is gone until the thread keeps it
 * (see NEW_RUN_EVENT).
 *
 * It opens without ceremony. Ctrl/⌘K is pressed hundreds of times a day,
 * and a palette that animates open is a palette that makes you wait: the
 * panel settles 4px in 120ms at full opacity and the input has focus on the
 * first frame, so typing never waits for anything.
 */

// Dispatched with the "New run" action; it lives with the shell, which
// dispatches it too.
export { NEW_RUN_EVENT } from './navigation'

type Group = 'Go to' | 'Actions' | 'Recent runs' | 'Harness runs'

/** How many of each list a browsing reader sees before typing. */
const BROWSE_LIMIT: Partial<Record<Group, number>> = { 'Recent runs': 6, 'Harness runs': 4 }

/** What a ranked search result is, since it no longer sits under a heading. */
const GROUP_WORD: Record<Group, string> = {
  'Go to': 'screen',
  Actions: 'action',
  'Recent runs': 'run',
  'Harness runs': 'harness',
}

interface Item {
  id: string
  group: Group
  label: string
  hint?: string
  /** Right-hand meta: a key sequence or a run's state. */
  meta?: ReactNode
  /** A state glyph before the label, with its -text tone. */
  glyph?: { char: string; tone: string }
  /** Hidden until the reader types: actions a browsing reader need not see. */
  searchOnly?: boolean
  go: () => void
}

/** A list read from the service, in the only three states a read has. */
type Reading<T> =
  | { status: 'reading' }
  | { status: 'read'; rows: T[]; at: number }
  | { status: 'failed'; detail: string | null }

function failureDetail(error: unknown): string | null {
  const e = (error ?? {}) as { detail?: unknown; message?: unknown }
  return typeof e.detail === 'string' ? e.detail : typeof e.message === 'string' ? e.message : null
}

/**
 * A harness run's own status, which is not its children's outcome. A
 * finished harness drove every item it was given; how they fared is the
 * tally, so "finished" takes no hue and no tick -- a finished run of
 * twenty-four refusals is not a success. What does take a hue: running,
 * a report waiting on a reviewer, a run the workbench interrupted (a
 * person has to decide what happens next) and a harness that broke.
 */
function harnessState(run: HarnessRunSummary) {
  if (run.status === 'running') return { char: '◐', tone: 'text-active-text', word: 'running' }
  if (run.status === 'cancelling') return { char: '◐', tone: 'text-active-text', word: 'stopping' }
  if (run.status === 'failed') return { char: '✕', tone: 'text-critical-text', word: 'failed' }
  if (run.status === 'interrupted') return { char: '◇', tone: 'text-approval-text', word: 'interrupted' }
  if (run.status === 'cancelled') return { char: '—', tone: 'text-foreground-muted', word: 'cancelled' }
  if (run.report_requires_approval && run.report_decision === 'pending') {
    return { char: '⏸', tone: 'text-approval-text', word: 'report held' }
  }
  return { char: '·', tone: 'text-foreground-muted', word: 'finished' }
}

/**
 * Task states, as a glyph, a tone and a word, for backend/core/schemas.py's
 * TaskStatus. Hue only where a state is. The in-progress statuses are
 * listed by name rather than being whatever is left over: a status this
 * table does not know is shown as itself in plain ink, because an unknown
 * status is not "running" -- a rejected run once fell through to exactly
 * that.
 */
const RUNNING = { char: '◐', tone: 'text-active-text', word: 'running' }
const RUN_STATE: Record<string, { char: string; tone: string; word: string }> = {
  received: RUNNING,
  classified: RUNNING,
  planned: RUNNING,
  retrieving: RUNNING,
  executing: RUNNING,
  verifying: RUNNING,
  awaiting_approval: { char: '⏸', tone: 'text-approval-text', word: 'held' },
  approved: { char: '✓', tone: 'text-sovereign-text', word: 'approved' },
  delivered: { char: '✓', tone: 'text-sovereign-text', word: 'delivered' },
  rejected: { char: '✕', tone: 'text-critical-text', word: 'rejected' },
  failed: { char: '✕', tone: 'text-critical-text', word: 'failed' },
  blocked: { char: '⛔', tone: 'text-critical-text', word: 'refused' },
  cancelled: { char: '—', tone: 'text-foreground-muted', word: 'cancelled' },
}

function runState(status: string) {
  const key = status.toLowerCase()
  return (
    RUN_STATE[key] ?? { char: '·', tone: 'text-foreground-muted', word: key.replace(/_/g, ' ') }
  )
}

function ago(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

/**
 * Subsequence match, so "aprv" finds Approvals and "clad" finds a run about
 * cladding, scored so that a prefix beats a scatter and a run of adjacent
 * letters beats the same letters spread out. Returns where the letters
 * landed, so the row can show why it matched.
 */
function match(haystack: string, needle: string): { points: number; hits: number[] } | null {
  if (!needle) return { points: 1, hits: [] }
  const hay = haystack.toLowerCase()
  const want = needle.toLowerCase()
  if (hay.startsWith(want)) {
    return { points: 1000 - hay.length, hits: Array.from({ length: want.length }, (_, i) => i) }
  }
  const word = hay.indexOf(` ${want}`)
  if (word !== -1) {
    return { points: 600, hits: Array.from({ length: want.length }, (_, i) => word + 1 + i) }
  }
  const hits: number[] = []
  let at = 0
  let points = 0
  let streak = 0
  for (const character of want) {
    const found = hay.indexOf(character, at)
    if (found === -1) return null
    streak = found === at ? streak + 1 : 0
    points += 10 + streak * 5 - Math.min(found - at, 8)
    hits.push(found)
    at = found + 1
  }
  return { points: Math.max(1, points), hits }
}

/** The label with its matched letters in full ink and the rest receded. */
function Highlighted({ text, hits }: { text: string; hits: number[] }) {
  if (hits.length === 0) return <>{text}</>
  const set = new Set(hits)
  const parts: ReactNode[] = []
  let run = ''
  let lit = set.has(0)
  const flush = (key: number) => {
    if (!run) return
    parts.push(
      lit ? (
        <span key={key} className="text-foreground">
          {run}
        </span>
      ) : (
        <span key={key}>{run}</span>
      ),
    )
    run = ''
  }
  Array.from(text).forEach((character, i) => {
    const isHit = set.has(i)
    if (isHit !== lit) {
      flush(i)
      lit = isHit
    }
    run += character
  })
  flush(text.length)
  return <>{parts}</>
}

export function CommandPalette() {
  const router = useRouter()
  const { role, setRole, logout } = useRole()
  const { push } = useToast()
  const mod = usePlatformMod()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [runs, setRuns] = useState<Reading<TaskSummary>>({ status: 'reading' })
  const [harnessRuns, setHarnessRuns] = useState<Reading<HarnessRunSummary>>({ status: 'reading' })
  const inputRef = useRef<HTMLInputElement | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const listId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((wasOpen) => !wasOpen)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [])

  // Runs are read when the palette opens, not on mount: this list goes
  // stale, and paying for it on every page load to serve a shortcut most
  // visits never use is the wrong trade. What the read returned is shown as
  // it returned: reading, the runs, none, or a failure -- an empty list and
  // an unreachable service must not look the same.
  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    setQuery('')
    setActive(0)
    setRuns({ status: 'reading' })
    setHarnessRuns({ status: 'reading' })
    let cancelled = false
    api
      .listTasks(30)
      .then((rows) => !cancelled && setRuns({ status: 'read', rows: rows || [], at: Date.now() }))
      .catch((error: unknown) => !cancelled && setRuns({ status: 'failed', detail: failureDetail(error) }))
    // Harness runs are addressed as /harnesses?run=<id>, the harness
    // screen's own URL scheme, so a run found here opens where its board is.
    harnessApi
      .runs(10)
      .then((rows) => !cancelled && setHarnessRuns({ status: 'read', rows: rows || [], at: Date.now() }))
      .catch((error: unknown) => !cancelled && setHarnessRuns({ status: 'failed', detail: failureDetail(error) }))
    return () => {
      cancelled = true
    }
  }, [open])

  // Focus goes in on open and back to whatever opened it on close: the part
  // that makes a palette usable rather than a trap. Scrolling behind the
  // overlay is held while it is open.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      const overflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = overflow
      }
    }
    restoreFocus.current?.focus?.()
  }, [open])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = DESTINATIONS.map((destination) => ({
      id: `screen-${destination.href}`,
      group: 'Go to',
      label: destination.label,
      hint: destination.hint,
      meta: (
        <span className="flex items-center gap-1">
          <Key>G</Key>
          <Key>{destination.key.toUpperCase()}</Key>
        </span>
      ),
      go: () => router.push(destination.href),
    }))

    out.push({
      id: 'action-new-run',
      group: 'Actions',
      label: 'New run',
      hint: 'go to the thread, to ask something',
      go: () => {
        router.push('/console')
        window.dispatchEvent(new Event(NEW_RUN_EVENT))
      },
    })
    // Named for what it opens, not "Run the self-test": the palette cannot
    // start it, and a row that said it would is the drift this list exists
    // to avoid. The test runs from its own button on the Sandbox screen.
    out.push({
      id: 'action-self-test',
      group: 'Actions',
      label: 'Containment self-test',
      hint: 'on the Sandbox screen, where it runs against this host',
      go: () => router.push('/sandbox'),
    })
    for (const other of ROLES) {
      if (other.id === role.id) continue
      out.push({
        id: `action-role-${other.id}`,
        group: 'Actions',
        label: `Sign in as ${other.label}`,
        hint: 'a real account on this host',
        searchOnly: true,
        go: () => {
          // The palette has closed by the time this settles, so a failed
          // switch is reported where it can still be read.
          void setRole(other.id).catch((error: unknown) => {
            const detail = (error as { message?: unknown })?.message
            push({
              title: `Could not sign in as ${other.label}`,
              detail: typeof detail === 'string' ? detail : 'The workbench did not accept the switch.',
              tone: 'critical',
            })
          })
        },
      })
    }
    out.push({
      id: 'action-sign-out',
      group: 'Actions',
      label: 'Sign out',
      searchOnly: true,
      go: () => {
        void logout().finally(() => router.push('/sign-in'))
      },
    })

    if (runs.status === 'read') {
      for (const run of runs.rows) {
        const state = runState(String(run.status))
        out.push({
          id: `run-${run.id}`,
          group: 'Recent runs',
          label: run.prompt,
          glyph: { char: state.char, tone: state.tone },
          meta: (
            <span className="flex items-center gap-2">
              <span className={state.tone}>{state.word}</span>
              <span className="text-foreground-muted">{ago(run.created_at)}</span>
            </span>
          ),
          go: () => router.push(`/console?run=${encodeURIComponent(run.id)}`),
        })
      }
    }

    if (harnessRuns.status === 'read') {
      for (const run of harnessRuns.rows) {
        const state = harnessState(run)
        out.push({
          id: `harness-${run.id}`,
          group: 'Harness runs',
          label: run.harness_name,
          glyph: { char: state.char, tone: state.tone },
          meta: (
            <span className="flex items-center gap-2">
              <span className={state.tone}>{state.word}</span>
              {/* The tally as the service counted it: delivered of total,
                  never a percentage the reader would have to trust. */}
              <span className="tabular text-foreground-muted">
                {run.tally.delivered} of {run.tally.total} delivered
              </span>
              <span className="text-foreground-muted">{ago(run.created_at)}</span>
            </span>
          ),
          go: () => router.push(`/harnesses?run=${encodeURIComponent(run.id)}`),
        })
      }
    }
    return out
  }, [runs, harnessRuns, router, role.id, setRole, logout, push])

  // Browsing (no query) shows each group in its order, with the run lists
  // cut to their newest few. Searching ranks everything together, so every
  // run that was read can still be found by typing.
  const view = useMemo(() => {
    const needle = query.trim()
    if (!needle) {
      const shown = new Map<Group, number>()
      return items
        .filter((item) => !item.searchOnly)
        .filter((item) => {
          const limit = BROWSE_LIMIT[item.group]
          if (limit === undefined) return true
          const count = shown.get(item.group) ?? 0
          shown.set(item.group, count + 1)
          return count < limit
        })
        .map((item) => ({ item, hits: [] as number[] }))
    }
    return items
      .map((item) => {
        const onLabel = match(item.label, needle)
        if (onLabel) return { item, hits: onLabel.hits, points: onLabel.points }
        const onHint = item.hint ? match(item.hint, needle) : null
        return onHint ? { item, hits: [] as number[], points: onHint.points / 4 } : null
      })
      .filter((row): row is { item: Item; hits: number[]; points: number } => row !== null)
      .sort((a, b) => b.points - a.points)
      .slice(0, 30)
  }, [items, query])

  const choose = useCallback((item?: Item) => {
    if (!item) return
    setOpen(false)
    item.go()
  }, [])

  const activeRowId = view[active] ? `${listId}-${view[active].item.id}` : undefined

  // Keep the active row in view while moving through it by keyboard.
  useEffect(() => {
    if (!open || !activeRowId) return
    document.getElementById(activeRowId)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeRowId])

  if (!open) return null

  const move = (step: number) => {
    if (view.length === 0) return
    setActive((i) => (i + step + view.length) % view.length)
  }

  const browsing = query.trim().length === 0

  // Browsing is grouped under headings; a search is one ranked list. Each
  // row keeps its index in `view`, which is what the keyboard moves through.
  const sections: { group: Group | null; rows: { item: Item; hits: number[]; index: number }[] }[] = []
  view.forEach(({ item, hits }, index) => {
    const group = browsing ? item.group : null
    const last = sections[sections.length - 1]
    if (last && last.group === group) last.rows.push({ item, hits, index })
    else sections.push({ group, rows: [{ item, hits, index }] })
  })

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center px-4 pt-[14vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      {/* The scrim fades; it is light, not content. No backdrop blur: this
          can open over a live run, and a blur would re-sample the board
          behind it on every frame the board changes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[var(--scrim)] animate-in fade-in duration-[var(--micro)] motion-reduce:animate-none"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        className="relative w-full max-w-[600px] overflow-hidden rounded-[var(--radius-lg-token)] bg-surface shadow-[var(--elev-3)] [--rise:-4px] animate-[aegis-rise_var(--micro)_var(--ease-micro)_both] motion-reduce:animate-none"
      >
        <div className="flex items-center gap-3 border-b border-line-default px-4">
          <Search className="size-4 shrink-0 text-foreground-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              const key = event.key
              if (key === 'ArrowDown' || (event.ctrlKey && key.toLowerCase() === 'n')) {
                event.preventDefault()
                move(1)
              } else if (key === 'ArrowUp' || (event.ctrlKey && key.toLowerCase() === 'p')) {
                event.preventDefault()
                move(-1)
              } else if (key === 'Enter') {
                event.preventDefault()
                choose(view[active]?.item)
              } else if (key === 'Escape') {
                event.preventDefault()
                setOpen(false)
              } else if (key === 'Tab') {
                // The field is the dialog's one stop; Tab must not walk out
                // of a modal into the page behind it.
                event.preventDefault()
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeRowId}
            aria-autocomplete="list"
            aria-label="Go to a screen, run or action"
            placeholder="Screen, run or action"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent text-answer text-foreground placeholder:text-foreground-muted focus:outline-none"
          />
          <kbd className="hidden h-4 items-center rounded-[var(--radius-xs)] px-1 font-mono text-ledger leading-none text-foreground-muted shadow-[0_0_0_1px_var(--control-subtle)] sm:inline-flex">
            esc
          </kbd>
        </div>

        <div id={listId} role="listbox" aria-label="Results" className="max-h-[56vh] overflow-y-auto p-1.5">
          {view.length === 0 ? (
            <p className="px-3 py-6 text-body text-foreground-secondary">Nothing matches that.</p>
          ) : (
            sections.map((section, s) => (
              <div
                key={section.group ?? 'ranked'}
                role="group"
                aria-label={section.group ?? 'Matches'}
              >
                {section.group && (
                  <div
                    aria-hidden
                    className={cn(
                      'flex items-baseline justify-between px-3 pb-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted',
                      s === 0 ? 'pt-1.5' : 'pt-3',
                    )}
                  >
                    <span>{section.group}</span>
                    {section.group === 'Recent runs' && runs.status === 'read' && (
                      <span className="normal-case tracking-normal">
                        read {new Date(runs.at).toLocaleTimeString()}
                      </span>
                    )}
                    {section.group === 'Harness runs' && harnessRuns.status === 'read' && (
                      <span className="normal-case tracking-normal">
                        read {new Date(harnessRuns.at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                )}
                {section.rows.map(({ item, hits, index }) => {
                  const selected = index === active
                  return (
                    <div
                      key={item.id}
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={selected}
                      // Mouse MOVE, not enter: keyboard movement scrolls the
                      // list under a still pointer, and mouseenter would then
                      // steal the selection from the key just pressed.
                      onMouseMove={() => {
                        if (!selected) setActive(index)
                      }}
                      onClick={() => choose(item)}
                      className={cn(
                        'flex h-9 cursor-pointer select-none items-center gap-3 rounded-[var(--radius-menu-row)] px-3',
                        selected && 'bg-[var(--selected-surface)] shadow-[inset_2px_0_0_0_var(--selected-rail)]',
                      )}
                    >
                      {item.glyph ? (
                        <span
                          aria-hidden
                          className={cn('w-3 shrink-0 text-center font-mono text-ui', item.glyph.tone)}
                        >
                          {item.glyph.char}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'min-w-0 truncate text-body',
                          browsing || hits.length === 0 ? 'text-foreground' : 'text-foreground-secondary',
                        )}
                      >
                        <Highlighted text={item.label} hits={hits} />
                      </span>
                      {item.hint && (
                        <span className="hidden min-w-0 flex-1 truncate text-ui text-foreground-muted sm:block">
                          {item.hint}
                        </span>
                      )}
                      {!browsing && (
                        <span className="shrink-0 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                          {GROUP_WORD[item.group]}
                        </span>
                      )}
                      {item.meta && (
                        <span className="ml-auto shrink-0 font-mono text-ledger text-foreground-muted">
                          {item.meta}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}

          {browsing && (runs.status === 'reading' || harnessRuns.status === 'reading') && (
            <p className="px-3 pb-2 pt-3 font-mono text-ledger text-foreground-muted">Reading recent runs…</p>
          )}
          {browsing && runs.status === 'read' && runs.rows.length === 0 && (
            <p className="px-3 pb-2 pt-3 text-ui text-foreground-muted">No runs on this host yet.</p>
          )}
          {runs.status === 'failed' && (
            <p className="px-3 pb-2 pt-3 text-ui text-foreground-secondary">
              Recent runs could not be read{runs.detail ? `: ${runs.detail}` : '.'} Screens and actions
              still work.
            </p>
          )}
          {harnessRuns.status === 'failed' && (
            <p className="px-3 pb-2 pt-3 text-ui text-foreground-secondary">
              Harness runs could not be read{harnessRuns.detail ? `: ${harnessRuns.detail}` : '.'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-line-default px-4 py-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto hidden normal-case tracking-normal sm:inline">
            {mod} K from anywhere · G then a letter to jump
          </span>
        </div>
      </div>
    </div>
  )
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-xs)] px-1 font-mono text-ledger leading-none text-foreground-muted shadow-[0_0_0_1px_var(--control-subtle)]">
      {children}
    </kbd>
  )
}
