'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { TaskSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Go anywhere without the mouse.
 *
 * The workbench has five screens and a queue that is already twenty-one runs
 * deep on a demo host. Reaching a particular run meant scrolling a rail;
 * reaching a screen meant crossing the page to the header. Neither is a lot
 * of work once. Both are a lot of work when a reviewer is checking a claim
 * against its source and back again.
 *
 * It proposes nothing it cannot do. Every row is a screen that exists or a
 * run the API returned, so the palette can never offer an action the product
 * does not have -- which is the failure mode of a command palette built from
 * a hardcoded list that drifts from the app.
 */

interface Item {
  group: string
  label: string
  hint?: string
  go: () => void
}

const SCREENS: { label: string; hint: string; href: string }[] = [
  { label: 'Thread', hint: 'ask, and watch the run', href: '/console' },
  { label: 'Approvals', hint: 'deliverables held for a reviewer', href: '/approvals' },
  { label: 'Knowledge', hint: 'models, SOPs, retrieval tester', href: '/registry' },
  { label: 'Assurance', hint: 'egress, sandbox, policy matrix', href: '/security' },
  { label: 'Audit', hint: 'the hash chain', href: '/audit' },
]

/**
 * Subsequence match, so "aprv" finds Approvals and "clad" finds a run about
 * cladding. Scored so that a prefix beats a scatter: typing "au" should reach
 * Audit before it reaches a run with "authority" in the middle of it.
 */
function score(haystack: string, needle: string): number {
  if (!needle) return 1
  const hay = haystack.toLowerCase()
  const want = needle.toLowerCase()
  if (hay.startsWith(want)) return 1000
  let at = 0
  let points = 0
  let streak = 0
  for (const character of want) {
    const found = hay.indexOf(character, at)
    if (found === -1) return 0
    streak = found === at ? streak + 1 : 0
    points += 10 + streak * 5 - Math.min(found - at, 8)
    at = found + 1
  }
  return Math.max(1, points)
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [runs, setRuns] = useState<TaskSummary[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((wasOpen) => !wasOpen)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Runs are read when the palette opens, not on mount: this is a list that
  // goes stale, and paying for it on every page load to serve a shortcut
  // most visits never use is the wrong trade.
  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    setQuery('')
    setActive(0)
    let cancelled = false
    api
      .listTasks(30)
      .then((rows) => !cancelled && setRuns(rows || []))
      .catch(() => !cancelled && setRuns([]))
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    // Returning focus to whatever opened it is the part that makes a palette
    // usable rather than a trap.
    else restoreFocus.current?.focus?.()
  }, [open])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = SCREENS.map((screen) => ({
      group: 'Screen',
      label: screen.label,
      hint: screen.hint,
      go: () => router.push(screen.href),
    }))
    out.push({
      group: 'Action',
      label: 'New run',
      hint: 'clear the thread and ask something',
      go: () => router.push('/console'),
    })
    for (const run of runs) {
      out.push({
        group: 'Run',
        label: run.prompt,
        hint: String(run.status).replace(/_/g, ' '),
        go: () => router.push(`/console?run=${run.id}`),
      })
    }
    return out
  }, [runs, router])

  const matches = useMemo(() => {
    return items
      .map((item) => ({ item, points: score(`${item.label} ${item.hint ?? ''}`, query) }))
      .filter((row) => row.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 12)
      .map((row) => row.item)
  }, [items, query])

  const run = useCallback(
    (item?: Item) => {
      if (!item) return
      setOpen(false)
      item.go()
    },
    [],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-background/70 px-4 pt-[14vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        className="w-full max-w-[560px] overflow-hidden rounded-[var(--radius)] border border-line-strong bg-surface shadow-[var(--elev-2)]"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((i) => Math.min(i + 1, matches.length - 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              run(matches[active])
            }
          }}
          placeholder="Screen, run or action"
          aria-label="Go to"
          autoComplete="off"
          spellCheck={false}
          className="w-full border-b border-line-default bg-transparent px-4 py-3.5 text-answer text-foreground placeholder:text-foreground-muted focus:outline-none"
        />

        <ul className="max-h-[52vh] list-none overflow-y-auto p-1.5">
          {matches.length === 0 ? (
            <li className="px-3 py-6 text-center text-body text-foreground-muted">
              Nothing matches that.
            </li>
          ) : (
            matches.map((item, i) => (
              <li key={`${item.group}-${item.label}-${i}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(item)}
                  aria-current={i === active ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-baseline gap-3 rounded-[var(--radius-xs)] px-3 py-2 text-left',
                    i === active ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
                  )}
                >
                  <span className="w-[62px] shrink-0 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                    {item.group}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-foreground">
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="shrink-0 font-mono text-ledger text-foreground-muted">
                      {item.hint}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center gap-4 border-t border-line-default px-4 py-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
          <span>↑↓ move</span>
          <span>↵ go</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
