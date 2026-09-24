'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { memo, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import {
  Activity,
  BookOpen,
  Box,
  ClipboardCheck,
  Layers,
  Link2,
  Menu,
  MessageSquare,
  RotateCw,
  Search,
  ShieldCheck,
  SquarePen,
  SquareSlash,
  X,
} from 'lucide-react'
import { api, request } from '@/lib/api'
import type { TaskSummary } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AegisMark } from './aegis-logo'
import { RoleSwitcher } from './role-switcher'
import { useRole } from './role-context'
import { SovereigntyStatus } from './sovereignty-status'
import { ThemeToggle } from './theme-toggle'

/**
 * The workbench's shell: one sidebar, the way a productivity tool is laid
 * out, with the places down its top, the runs under them, and the account
 * and the host's egress reading at its foot.
 *
 *   Thread      ask one question, and watch it be answered
 *   Skills      saved instructions, called with /
 *   Harnesses   ask the same question of many things, as one governed run
 *   Approvals   decide what a person has to release
 *   Knowledge   what the workbench knows and runs on
 *   Assurance   what this host can show about its own conduct -- its
 *               posture, its sandbox and its audit chain
 *
 * The runs used to be a second rail inside the thread, beside a header of
 * tabs: two navigations on one screen. They are one list now, in the one
 * sidebar, reachable from every screen, and a run opens by URL (?run=), so
 * the sidebar never reaches into the thread's state. The thread says when
 * its runs change with RUNS_CHANGED_EVENT, and the sidebar re-reads.
 *
 * Every place is also two keys away: G then its letter, which the palette
 * and each row's title list. Ctrl/⌘K reaches every screen by name. Under
 * 1024px the sidebar is a sheet behind a menu button in a slim top bar.
 */

export interface Destination {
  href: string
  label: string
  /** The second key of its G sequence. */
  key: string
  /** One line, for the palette. */
  hint: string
}

interface Place extends Destination {
  /** Paths that make this place the current one. */
  paths: string[]
  icon: ComponentType<{ className?: string }>
  children?: Array<Destination & { icon: ComponentType<{ className?: string }> }>
}

export const PLACES: Place[] = [
  { href: '/console', label: 'Thread', key: 't', hint: 'ask, and watch the run', paths: ['/console'], icon: MessageSquare },
  { href: '/skills', label: 'Skills', key: 'i', hint: 'saved instructions, called with /', paths: ['/skills'], icon: SquareSlash },
  { href: '/harnesses', label: 'Harnesses', key: 'h', hint: 'governed multi-run jobs', paths: ['/harnesses'], icon: Layers },
  { href: '/approvals', label: 'Approvals', key: 'a', hint: 'deliverables held for a reviewer', paths: ['/approvals'], icon: ClipboardCheck },
  { href: '/registry', label: 'Knowledge', key: 'k', hint: 'models, SOPs, retrieval', paths: ['/registry'], icon: BookOpen },
  {
    href: '/security',
    label: 'Assurance',
    key: 'p',
    hint: 'what this host can show about its own conduct',
    paths: ['/security', '/sandbox', '/audit'],
    icon: ShieldCheck,
    children: [
      { href: '/security', label: 'Posture', key: 'p', hint: 'egress as measured, and the policy', icon: Activity },
      { href: '/sandbox', label: 'Sandbox', key: 's', hint: "run code under this host's limits", icon: Box },
      { href: '/audit', label: 'Audit', key: 'l', hint: 'the hash-chained record', icon: Link2 },
    ],
  },
]

/** Every screen, flat, in navigation order. The palette lists these. */
export const DESTINATIONS: Destination[] = PLACES.flatMap((place) =>
  place.children
    ? place.children.map(({ href, label, key, hint }) => ({ href, label, key, hint }))
    : [{ href: place.href, label: place.label, key: place.key, hint: place.hint }],
)

/**
 * Dispatched with "New run" -- from the sidebar or the palette -- after
 * going to the thread, which clears itself when it hears it.
 */
export const NEW_RUN_EVENT = 'aegis:new-run'

/** Open the command palette from anywhere, without importing it. */
export const OPEN_PALETTE_EVENT = 'aegis:palette'
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
}

/**
 * Dispatch after anything that changes the approval queue -- a run settling
 * as held, a decision recorded -- and the sidebar re-reads its count at once
 * instead of at the next navigation.
 */
export const APPROVALS_CHANGED_EVENT = 'aegis:approvals-changed'

/**
 * Dispatched by the thread when a run starts, settles or is followed live,
 * with the id of the run it is following (or null). The sidebar re-reads its
 * list of runs and marks the live one.
 */
export const RUNS_CHANGED_EVENT = 'aegis:runs-changed'
export interface RunsChangedDetail {
  running: string | null
}

function onPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`)
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * The modifier to print. Read after mount: the platform is a fact about the
 * browser, and the server does not have one to render.
 */
export function usePlatformMod(): string {
  const [mod, setMod] = useState('Ctrl')
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent
    if (/mac|iphone|ipad/i.test(platform)) setMod('⌘')
  }, [])
  return mod
}

/**
 * The approval queue's length, for the count on the Approvals row.
 *
 * A reading, so it follows the reading rules: shown only when the read
 * succeeded and the queue is not empty, never a zero it did not get, and
 * dated in the row's title. It is read when the sidebar mounts, on every
 * change of screen, when the tab becomes visible again and when something
 * announces APPROVALS_CHANGED_EVENT. It is deliberately not polled: the
 * queue endpoint returns whole task records, and a timer re-reading them
 * for a badge would compete with inference for nothing.
 */
function useHeldCount(enabled: boolean, pathname: string) {
  const [held, setHeld] = useState<{ count: number; at: number } | null>(null)
  const [nudge, setNudge] = useState(0)

  useEffect(() => {
    const bump = () => setNudge((n) => n + 1)
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump()
    }
    window.addEventListener(APPROVALS_CHANGED_EVENT, bump)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(APPROVALS_CHANGED_EVENT, bump)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setHeld(null)
      return
    }
    const controller = new AbortController()
    // A service pinned by a model run can take a while to answer; after
    // this the read is abandoned and the last good count stays, dated.
    const timer = window.setTimeout(() => controller.abort(), 15_000)
    request<unknown[]>('/approvals', { signal: controller.signal })
      .then((rows) => setHeld(Array.isArray(rows) ? { count: rows.length, at: Date.now() } : null))
      .catch(() => {
        // Superseded or timed out: keep the last reading. Refused or
        // unreachable: there is no count, so none is shown.
        if (!controller.signal.aborted) setHeld(null)
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, pathname, nudge])

  return held
}

// ----------------------------------------------------------------- runs

/** A run's state as a dot: the colour says what it came to, the title says it in words. */
const OUTCOME_DOT: Record<string, string> = {
  awaiting_approval: 'bg-approval',
  approved: 'bg-sovereign',
  delivered: 'bg-sovereign',
  rejected: 'bg-critical',
  failed: 'bg-critical',
  blocked: 'bg-critical',
  cancelled: 'bg-control-strong',
}
const FINISHED = new Set(['awaiting_approval', 'approved', 'delivered', 'rejected', 'failed', 'blocked', 'cancelled'])

/** Today, Yesterday, Previous 7 days, Earlier. */
function dayGroup(iso: string, now = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'Earlier'
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 24 * 60 * 60 * 1000
  if (then.getTime() >= start) return 'Today'
  if (then.getTime() >= start - day) return 'Yesterday'
  if (then.getTime() >= start - 7 * day) return 'Previous 7 days'
  return 'Earlier'
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/**
 * How often the list is read again while a run it shows is unfinished: a
 * status here is a reading taken when the list was fetched, and a run left
 * to finish in the background would otherwise say "executing" until
 * something else refreshed it.
 */
const UNFINISHED_REFRESH_MS = 10_000

/**
 * The runs, newest first, as the thread opens them. These are tasks, not
 * conversations: this backend has no thread entity and each run stands
 * alone, so the list says "runs", never "chats".
 */
const RunList = memo(function RunList({ activeId, onPick }: { activeId: string | null; onPick: () => void }) {
  const router = useRouter()
  const [runs, setRuns] = useState<TaskSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<RunsChangedDetail>).detail
      setRunning(detail?.running ?? null)
      setTick((n) => n + 1)
    }
    window.addEventListener(RUNS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(RUNS_CHANGED_EVENT, onChanged)
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .listTasks(40)
      .then((rows) => {
        if (cancelled) return
        setRuns(rows || [])
        setError(null)
      })
      // Named, not swallowed: an empty list and an unreachable API look the
      // same otherwise, and one of them is worth seeing.
      .catch((err) => !cancelled && setError(err?.detail || err?.message || 'Could not read past runs.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [tick])

  const unfinished = runs.some((task) => !FINISHED.has(String(task.status).toLowerCase()))
  useEffect(() => {
    if (!unfinished) return
    const id = window.setTimeout(() => setTick((n) => n + 1), UNFINISHED_REFRESH_MS)
    return () => window.clearTimeout(id)
  }, [unfinished, runs])

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? runs.filter((task) =>
        [task.prompt, task.skill ? `/${task.skill.id} ${task.skill.input}` : ''].some((text) => text.toLowerCase().includes(needle)),
      )
    : runs

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-1 pt-1">
        <label className="relative block">
          <span className="sr-only">Filter runs</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter runs"
            className="h-8 w-full rounded-[8px] bg-transparent pl-8 pr-2 text-[13px] text-foreground placeholder:text-foreground-muted transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] focus:bg-surface focus:shadow-[0_0_0_1px_var(--line-default)] focus:outline-none"
          />
        </label>
      </div>
      {/* Relative, so it contains the rows' screen-reader labels, which are
          absolutely positioned and would otherwise stretch the page. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <p className="px-2 py-2 text-[13px] text-foreground-muted">Loading runs…</p>
        ) : error ? (
          <p className="flex items-start gap-1.5 px-2 py-2 text-meta text-critical-text">
            <RotateCw className="mt-0.5 size-3 shrink-0" aria-hidden />
            {error}
          </p>
        ) : runs.length === 0 ? (
          <p className="px-2 py-2 text-[13px] text-foreground-muted">No runs yet on this host.</p>
        ) : shown.length === 0 ? (
          <p className="px-2 py-2 text-[13px] text-foreground-muted">No run matches “{query.trim()}”.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-px p-0">
            {shown.map((task, i) => {
              const active = task.id === activeId
              const status = String(task.status).toLowerCase()
              const following = task.id === running
              const group = dayGroup(task.created_at)
              const firstOfGroup = i === 0 || dayGroup(shown[i - 1].created_at) !== group
              const stateWords = following ? 'in progress' : status.replace(/_/g, ' ')
              return (
                <li key={task.id}>
                  {firstOfGroup ? <p className="px-2 pb-1 pt-3 text-[11.5px] font-medium text-foreground-muted">{group}</p> : null}
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/console?run=${task.id}`)
                      onPick()
                    }}
                    aria-current={active ? 'true' : undefined}
                    title={`${task.skill ? `/${task.skill.id} ${task.skill.input}` : task.prompt} (${stateWords}, ${relativeTime(task.created_at)})`}
                    className={cn(
                      'flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2 text-left transition-colors duration-100',
                      'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                      active ? 'bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)]' : 'hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        following
                          ? 'animate-pulse bg-active motion-reduce:animate-none'
                          : OUTCOME_DOT[status] ?? (FINISHED.has(status) ? 'bg-control-strong' : 'bg-active'),
                      )}
                    />
                    <span className={cn('min-w-0 flex-1 truncate text-[13px]', active ? 'font-medium text-foreground' : 'text-foreground-secondary')}>
                      {task.skill ? (
                        <>
                          <span className="font-mono text-[12px] text-foreground-muted">/{task.skill.id}</span> {task.skill.input}
                        </>
                      ) : (
                        task.prompt
                      )}
                    </span>
                    <span className="sr-only">
                      {stateWords}, {relativeTime(task.created_at)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
})

/**
 * The list, marked with the run the thread has open. Reading ?run= needs a
 * Suspense boundary in a layout, so it is read here, below one, and the
 * list renders unmarked for the moment before it is.
 */
function MarkedRunList({ onPick }: { onPick: () => void }) {
  const pathname = usePathname() ?? ''
  const params = useSearchParams()
  return <RunList activeId={onPath(pathname, '/console') ? params.get('run') : null} onPick={onPick} />
}

// ------------------------------------------------------------ the sidebar

function SidebarBody({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { role, can } = useRole()
  const mod = usePlatformMod()
  const held = useHeldCount(can('approval.read'), pathname)

  // The Assurance row opens where the reader's job is: the auditor's is the
  // chain, everyone else's is the posture.
  const hrefFor = (place: Place) => (place.children ? (role.id === 'auditor' ? '/audit' : place.href) : place.href)

  const newRun = () => {
    const openRun = new URLSearchParams(window.location.search).has('run')
    if (!onPath(pathname, '/console') || openRun) router.push('/console')
    window.dispatchEvent(new Event(NEW_RUN_EVENT))
    onNavigate()
  }

  const row = 'flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[13.5px] transition-colors duration-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Link href="/console" aria-label="AEGIS, the thread" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none">
          <AegisMark size={22} />
          <span className="text-[15px] font-semibold tracking-[0.03em]">AEGIS</span>
        </Link>
      </div>

      <div className="flex shrink-0 flex-col gap-1 px-3">
        <button
          type="button"
          onClick={newRun}
          className="flex h-9 items-center gap-2.5 rounded-[9px] border border-line-subtle bg-surface px-2.5 text-[13.5px] font-medium text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.05)] transition-[border-color,box-shadow] duration-150 hover:border-line-default focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.99]"
        >
          <SquarePen className="size-4 text-foreground-secondary" aria-hidden />
          New run
        </button>
        <button
          type="button"
          onClick={() => {
            openCommandPalette()
            onNavigate()
          }}
          aria-keyshortcuts="Control+K Meta+K"
          className={cn(row, 'text-foreground-secondary hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] hover:text-foreground')}
        >
          <Search className="size-4 text-foreground-muted" aria-hidden />
          Search
          <kbd className="ml-auto rounded-[5px] px-1.5 font-sans text-[11px] text-foreground-muted shadow-[0_0_0_1px_var(--line-subtle)]">{mod} K</kbd>
        </button>
      </div>

      <nav aria-label="Workbench" className="mt-4 shrink-0 px-3">
        <ul className="m-0 flex list-none flex-col gap-px p-0">
          {PLACES.map((place) => {
            const isCurrent = place.paths.some((path) => onPath(pathname, path))
            const Icon = place.icon
            const count = place.href === '/approvals' && held && held.count > 0 ? held.count : null
            return (
              <li key={place.href}>
                <Link
                  href={hrefFor(place)}
                  onClick={onNavigate}
                  aria-current={isCurrent && !place.children ? 'page' : undefined}
                  title={
                    count !== null && held
                      ? `${place.label} · G then ${place.key.toUpperCase()} · ${count} held, read ${new Date(held.at).toLocaleTimeString()}`
                      : `${place.label} · G then ${place.key.toUpperCase()}`
                  }
                  className={cn(
                    row,
                    isCurrent && !place.children
                      ? 'bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] font-medium text-foreground'
                      : 'text-foreground-secondary hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] hover:text-foreground',
                    isCurrent && place.children && 'font-medium text-foreground',
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', isCurrent ? 'text-foreground' : 'text-foreground-muted')} />
                  {place.label}
                  {count !== null ? (
                    <span className="tabular ml-auto rounded-[5px] px-1.5 font-mono text-[11px] leading-[18px] text-approval-text shadow-[0_0_0_1px_var(--approval-border)]">
                      {count}
                      <span className="sr-only"> held</span>
                    </span>
                  ) : null}
                </Link>
                {place.children ? (
                  <ul className="m-0 ml-[17px] flex list-none flex-col gap-px border-l border-line-subtle p-0 pl-2">
                    {place.children.map((child) => {
                      const childCurrent = onPath(pathname, child.href)
                      const ChildIcon = child.icon
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            aria-current={childCurrent ? 'page' : undefined}
                            title={`${child.label} · G then ${child.key.toUpperCase()}`}
                            className={cn(
                              row,
                              'h-7 text-[13px]',
                              childCurrent
                                ? 'bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] font-medium text-foreground'
                                : 'text-foreground-muted hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] hover:text-foreground',
                            )}
                          >
                            <ChildIcon className="size-3.5 shrink-0" />
                            {child.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-line-subtle pt-3">
        <p className="px-5 pb-1 text-[12px] font-medium text-foreground-muted">Runs</p>
        <Suspense fallback={<RunList activeId={null} onPick={onNavigate} />}>
          <MarkedRunList onPick={onNavigate} />
        </Suspense>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-line-subtle p-3">
        <div className="flex items-center justify-between gap-2">
          <SovereigntyStatus placement="above" />
          <ThemeToggle />
        </div>
        <RoleSwitcher placement="above" />
      </div>
    </div>
  )
}

export function Navigation() {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  // ------------------------------------------------------- G sequences
  useEffect(() => {
    const table = new Map(DESTINATIONS.map((d) => [d.key, d.href]))
    let armedAt = 0
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      // A dialog owns the keyboard while it is open.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const key = event.key.toLowerCase()
      if (armedAt && event.timeStamp - armedAt < 1200) {
        armedAt = 0
        const href = table.get(key)
        if (href) {
          // Taken before the screen's own single-key handlers see it, so
          // G then A goes to Approvals rather than opening an approval.
          event.preventDefault()
          event.stopPropagation()
          router.push(href)
        }
        return
      }
      armedAt = key === 'g' && !event.shiftKey ? event.timeStamp : 0
    }
    // Capture, so the sequence is resolved before any bubbling handler.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [router])

  // ------------------------------------------------------------ mobile
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    sheetRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <>
      {/* The sidebar, from a laptop's width up. */}
      <aside
        aria-label="Workbench"
        className="fixed inset-y-0 left-0 z-[var(--z-topbar)] hidden w-[var(--sidebar-w)] border-r border-line-subtle bg-surface-sunken lg:block"
      >
        <SidebarBody onNavigate={() => {}} />
      </aside>

      {/* Below it: a slim top bar, and the same sidebar as a sheet. */}
      <header className="fixed inset-x-0 top-0 z-[var(--z-topbar)] flex h-14 items-center gap-3 border-b border-line-subtle bg-background px-4 lg:hidden">
        <button
          type="button"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex size-9 items-center justify-center rounded-[9px] text-foreground shadow-[0_0_0_1px_var(--line-subtle)] hover:bg-surface-sunken focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          {mobileOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
        </button>
        <Link href="/console" aria-label="AEGIS, the thread" className="flex items-center gap-2 text-foreground">
          <AegisMark size={20} />
          <span className="text-[14px] font-semibold tracking-[0.03em]">AEGIS</span>
        </Link>
        <div className="ml-auto">
          <SovereigntyStatus />
        </div>
      </header>
      {mobileOpen ? (
        <>
          <div aria-hidden onClick={() => setMobileOpen(false)} className="fixed inset-0 z-[var(--z-drawer)] bg-[var(--scrim)] lg:hidden" />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Workbench"
            className="fixed inset-y-0 left-0 z-[var(--z-drawer)] w-[min(300px,86vw)] border-r border-line-subtle bg-surface-sunken shadow-[var(--elev-3)] lg:hidden"
          >
            <SidebarBody onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      ) : null}
    </>
  )
}
