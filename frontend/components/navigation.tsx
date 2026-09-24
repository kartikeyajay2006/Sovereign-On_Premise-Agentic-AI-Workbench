'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { Menu, Search, X } from 'lucide-react'
import { request } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Light } from '@/shared/motion/light'
import { useReducedMotion } from '@/shared/motion/preferences'
import { AegisLogo } from './aegis-logo'
import { RoleSwitcher } from './role-switcher'
import { useRole } from './role-context'
import { SovereigntyStatus } from './sovereignty-status'

/**
 * Five places, seven screens.
 *
 * Seven tabs became five when the thread absorbed Ask and Tasks: those were
 * duplicates, two more ways to do the one job the thread does. Two new
 * screens have arrived since, and each has earned a place by job, not by
 * subsystem -- which was the rule the cut followed.
 *
 *   Thread      ask one question, and watch it be answered
 *   Harnesses   ask the same question of many things, as one governed run
 *   Approvals   decide what a person has to release
 *   Knowledge   what the workbench knows and runs on
 *   Assurance   what this host can show about its own conduct
 *
 * Harnesses is a new job, so it is a place. The sandbox console is not a
 * new job: it is the most direct way to see this host contain a real
 * payload, which is what Assurance is for, so it lives there -- with the
 * audit chain, which is the host's record of its own conduct and the
 * other half of the same argument. The three are one place with three
 * readings, switched from a second row that exists only on those screens.
 * Every screen keeps its URL, so nothing linked or bookmarked moves.
 *
 * Every place is also two keys away: G then its letter, which the palette
 * and each tab's title list. Ctrl/⌘K reaches all seven by name.
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
  children?: Destination[]
}

export const PLACES: Place[] = [
  { href: '/console', label: 'Thread', key: 't', hint: 'ask, and watch the run', paths: ['/console'] },
  { href: '/skills', label: 'Skills', key: 'i', hint: 'saved instructions, called with /', paths: ['/skills'] },
  {
    href: '/harnesses',
    label: 'Harnesses',
    key: 'h',
    hint: 'governed multi-run jobs',
    paths: ['/harnesses'],
  },
  {
    href: '/approvals',
    label: 'Approvals',
    key: 'a',
    hint: 'deliverables held for a reviewer',
    paths: ['/approvals'],
  },
  { href: '/registry', label: 'Knowledge', key: 'k', hint: 'models, SOPs, retrieval', paths: ['/registry'] },
  {
    href: '/security',
    label: 'Assurance',
    key: 'p',
    hint: 'what this host can show about its own conduct',
    paths: ['/security', '/sandbox', '/audit'],
    children: [
      { href: '/security', label: 'Posture', key: 'p', hint: 'egress as measured, and the policy' },
      { href: '/sandbox', label: 'Sandbox', key: 's', hint: "run code under this host's limits" },
      { href: '/audit', label: 'Audit', key: 'l', hint: 'the hash-chained record' },
    ],
  },
]

/** Every screen, flat, in navigation order. The palette lists these. */
export const DESTINATIONS: Destination[] = PLACES.flatMap((place) =>
  place.children ? place.children : [place],
)

/** Open the command palette from anywhere, without importing it. */
export const OPEN_PALETTE_EVENT = 'aegis:palette'
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
}

/**
 * Dispatch after anything that changes the approval queue -- a run settling
 * as held, a decision recorded -- and the header re-reads its count at once
 * instead of at the next navigation.
 */
export const APPROVALS_CHANGED_EVENT = 'aegis:approvals-changed'

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
 * Where an element's LABEL sits inside its positioned container -- its box
 * less its own horizontal padding, so a rule drawn from this spans exactly
 * the words at every breakpoint's padding -- kept current as fonts load and
 * the window resizes. `ready` turns true one frame after the first
 * placement, so an indicator is placed instantly on first paint and only
 * glides for changes after that.
 */
function useSlot(container: RefObject<HTMLElement | null>, slot: string | null) {
  const [box, setBox] = useState<{ x: number; w: number } | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const root = container.current
    const find = () => (root && slot ? root.querySelector<HTMLElement>(`[data-slot="${slot}"]`) : null)
    if (!find()) {
      // Nothing to point at -- the second row has gone, or this screen is
      // not a place. Forget the glide too, so the indicator is placed, not
      // flown in from wherever it was last, when there is one again.
      setBox(null)
      setReady(false)
      return
    }
    const measure = () => {
      const el = find()
      if (!el) {
        setBox(null)
        return
      }
      const style = getComputedStyle(el)
      const left = parseFloat(style.paddingLeft) || 0
      const right = parseFloat(style.paddingRight) || 0
      setBox({ x: el.offsetLeft + left, w: Math.max(0, el.offsetWidth - left - right) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root!)
    return () => observer.disconnect()
  }, [container, slot])

  useEffect(() => {
    if (!box || ready) return
    const frame = window.requestAnimationFrame(() => setReady(true))
    return () => window.cancelAnimationFrame(frame)
  }, [box, ready])

  return { box, ready }
}

/**
 * The approval queue's length, for the count on the Approvals tab.
 *
 * A reading, so it follows the reading rules: shown only when the read
 * succeeded and the queue is not empty, never a zero it did not get, and
 * dated in the tab's title. It is read when the header mounts, on every
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

export function Navigation() {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { role, can } = useRole()
  const mod = usePlatformMod()
  const reduced = useReducedMotion()
  const [mobileOpen, setMobileOpen] = useState(false)

  const current = PLACES.find((place) => place.paths.some((path) => onPath(pathname, path))) ?? null
  const currentChild = current?.children?.find((child) => onPath(pathname, child.href)) ?? null

  // The Assurance tab opens where the reader's job is: the auditor's is the
  // chain, everyone else's is the posture.
  const hrefFor = (place: Place) =>
    place.children ? (role.id === 'auditor' ? '/audit' : place.href) : place.href

  // --------------------------------------------------------------- held
  const held = useHeldCount(can('approval.read'), pathname)
  const lastHeld = useRef<number | null>(null)
  const [heldRose, setHeldRose] = useState(0)
  useEffect(() => {
    const count = held?.count ?? null
    // The count lights when it rises, because that is a run arriving at the
    // gate. Falling is a decision made, which is not "held".
    if (count !== null && lastHeld.current !== null && count > lastHeld.current) {
      setHeldRose((n) => n + 1)
    }
    if (count !== null) lastHeld.current = count
  }, [held])

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
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // -------------------------------------------------------- indicators
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const subRef = useRef<HTMLDivElement | null>(null)
  const active = useSlot(tabsRef, current?.href ?? null)
  const activeSub = useSlot(subRef, currentChild?.href ?? null)

  // The hover highlight glides between tabs while the pointer moves across
  // them. It appears at once where the pointer enters, glides only for a
  // move from one tab to the next, and fades on the hover pair's 150ms
  // decay when the pointer leaves the group.
  const [hover, setHover] = useState<{ x: number; w: number; glide: boolean } | null>(null)
  const [hoverShown, setHoverShown] = useState(false)
  const hoverShownRef = useRef(false)
  hoverShownRef.current = hoverShown
  const onTabEnter = useCallback((el: HTMLElement) => {
    // Glide only from a highlight already on screen. Entering the group
    // from outside places it at once: there is nothing to glide from.
    const glide = hoverShownRef.current
    setHover({ x: el.offsetLeft, w: el.offsetWidth, glide })
  }, [])

  const subnav = current?.children ?? null

  return (
    /*
      A flat bar on a hairline, not a floating card: a bar that meets the
      edges and sits on a rule reads as part of the instrument, and a card
      floating over the page is every template's house style.

      No backdrop-filter. A full-width blur re-samples everything beneath it
      on every frame anything under it changes, and what scrolls under this
      bar is a live stage board.
    */
    <header className="fixed inset-x-0 top-0 z-[80] border-b border-line-subtle bg-background">
      {/*
        Budgeted for 1024px, the narrowest width the tabs show at: logo,
        five tabs, the posture readout and the account button come to about
        1010px there, so between lg and xl the gaps and tab padding tighten
        and the Go-to button steps aside (Ctrl/⌘K still opens the palette).
      */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-4 sm:px-6 xl:gap-x-6">
        {/* Inside the app the mark goes to the thread, not out to the public
            page: clicking a logo should not sign you out of the room. */}
        <Link
          href="/console"
          aria-label="AEGIS, the thread"
          className="col-start-1 row-start-1 flex h-14 shrink-0 items-center rounded-[var(--radius)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <AegisLogo size={24} variant="compact" />
        </Link>

        <nav
          aria-label="Workbench"
          className="col-start-2 row-start-1 hidden h-14 min-w-0 items-stretch lg:flex"
        >
          <div
            ref={tabsRef}
            className="relative flex items-stretch"
            onPointerLeave={() => setHoverShown(false)}
          >
            {/* The hover highlight. Its width animates as well as its
                position: it is out of flow, has no children and is one
                element, so the layout it costs is its own box. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-3 left-0 rounded-full bg-surface-sunken"
              style={{
                width: hover?.w ?? 0,
                transform: `translateX(${hover?.x ?? 0}px)`,
                opacity: hoverShown && hover ? 1 : 0,
                transition: !hoverShown
                  ? 'opacity var(--hover-out) var(--ease-move)'
                  : hover?.glide && !reduced
                    ? 'transform var(--micro) var(--ease-micro), width var(--micro) var(--ease-micro), opacity 0ms'
                    : 'none',
              }}
            />

            {PLACES.map((place) => {
              const isCurrent = current?.href === place.href
              const isApprovals = place.href === '/approvals'
              const count = isApprovals && held && held.count > 0 ? held.count : null
              return (
                <Link
                  key={place.href}
                  href={hrefFor(place)}
                  data-slot={place.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  title={
                    isApprovals && held
                      ? `${place.label} · G then ${place.key.toUpperCase()} · ${held.count} held, read ${new Date(held.at).toLocaleTimeString()}`
                      : `${place.label} · G then ${place.key.toUpperCase()}`
                  }
                  onPointerEnter={(event) => {
                    onTabEnter(event.currentTarget)
                    setHoverShown(true)
                  }}
                  className={cn(
                    'app-tab relative flex items-center gap-2 rounded-full px-3',
                    'transition-colors duration-[var(--hover-out)] ease-[var(--ease-move)] hover:duration-0',
                    'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                    isCurrent ? 'text-foreground' : 'text-foreground-muted hover:text-foreground',
                  )}
                >
                  {place.label}
                  {count !== null && (
                    <Light
                      as="span"
                      tone="approval"
                      bloomKey={heldRose || null}
                      className="inline-flex rounded-[var(--radius-xs)]"
                    >
                      <span className="tabular flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-xs)] px-1 font-mono text-ledger leading-none text-approval-text shadow-[0_0_0_1px_var(--approval-border)]">
                        {count}
                        <span className="sr-only"> held</span>
                      </span>
                    </Light>
                  )}
                </Link>
              )
            })}

            {/* The current place: an ink bar sitting on the header's own
                rule. Ink, because selection is never a status hue. It is a
                1px element scaled to the tab's width, so the glide between
                tabs is a composited transform and never a layout. */}
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute -bottom-px left-0 h-[2px] w-px origin-left bg-[var(--action)]',
                active.ready &&
                  'transition-transform duration-[var(--spatial)] ease-[var(--ease-spatial)] motion-reduce:transition-none',
              )}
              style={
                active.box
                  ? { transform: `translateX(${active.box.x}px) scaleX(${active.box.w})` }
                  : { opacity: 0 }
              }
            />
          </div>
        </nav>

        <div className="col-start-3 row-start-1 flex h-14 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Go to a screen, run or action"
            aria-keyshortcuts="Control+K Meta+K"
            className={cn(
              'hover-decay hidden h-8 items-center gap-2 rounded-full bg-surface px-3 text-ui text-foreground-muted md:flex lg:hidden xl:flex xl:w-[200px]',
              'shadow-[0_0_0_1px_var(--line-subtle)] hover:text-foreground hover:shadow-[0_0_0_1px_var(--line-default)]',
              'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
            )}
          >
            <Search className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden xl:inline">Search</span>
            <kbd className="ml-auto hidden h-5 items-center rounded-full px-1.5 font-sans text-[11px] leading-none text-foreground-muted shadow-[0_0_0_1px_var(--line-subtle)] xl:inline-flex">
              {mod} K
            </kbd>
          </button>
          <div className="hidden sm:block">
            <SovereigntyStatus />
          </div>
          <RoleSwitcher />
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="hover-decay flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-foreground shadow-[0_0_0_1px_var(--control-default)] hover:bg-surface-sunken focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none lg:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        {/*
          The second row: one place, three readings. It exists only on the
          Assurance screens, and its presence is what the app frame reads
          (via :has) to reserve the extra 36px, so the value is right on the
          first frame. The same ink rule as the row above, one scale down:
          switching a reading and switching a place are the same gesture.
        */}
        {subnav && (
          <nav
            aria-label={`${current?.label} screens`}
            data-shell-subnav
            className="col-span-3 row-start-2 h-9 lg:col-span-1 lg:col-start-2"
          >
            <div ref={subRef} className="relative flex h-full items-stretch">
              {subnav.map((child) => {
                const isCurrent = currentChild?.href === child.href
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    data-slot={child.href}
                    aria-current={isCurrent ? 'page' : undefined}
                    title={`${child.label} · G then ${child.key.toUpperCase()}`}
                    className={cn(
                      'app-tab sub hover-decay flex items-center rounded-[var(--radius-xs)] px-3',
                      'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                      isCurrent ? 'text-foreground' : 'text-foreground-muted hover:text-foreground',
                    )}
                  >
                    {child.label}
                  </Link>
                )
              })}
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute -bottom-px left-0 h-[2px] w-px origin-left bg-[var(--action)]',
                  activeSub.ready &&
                    'transition-transform duration-[var(--spatial)] ease-[var(--ease-spatial)] motion-reduce:transition-none',
                )}
                style={
                  activeSub.box
                    ? { transform: `translateX(${activeSub.box.x}px) scaleX(${activeSub.box.w})` }
                    : { opacity: 0 }
                }
              />
            </div>
          </nav>
        )}
      </div>

      {/* The rule between the two rows spans the window, like the one under
          the header does; inside the 1400px column it would stop short. */}
      {subnav && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-14 h-px bg-line-subtle" />
      )}

      {/* A tap outside the sheet closes it. The scrim is light, so it fades;
          the sheet is content, so it moves. */}
      {mobileOpen && (
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className="fixed inset-x-0 bottom-0 top-14 bg-[var(--scrim)] animate-in fade-in duration-[var(--micro)] motion-reduce:animate-none lg:hidden"
        />
      )}
      {mobileOpen && (
        <div
          className="aegis-appear absolute inset-x-0 top-full border-b border-line-default bg-surface shadow-[var(--elev-2)] lg:hidden"
          style={{ '--rise': 'calc(var(--shift-sm) * -1)' } as CSSProperties}
        >
          <nav aria-label="Workbench" className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
            <ul className="flex flex-col">
              {PLACES.map((place) => {
                const isCurrent = current?.href === place.href
                return (
                  <li key={place.href}>
                    <Link
                      href={hrefFor(place)}
                      aria-current={isCurrent && !place.children ? 'page' : undefined}
                      className={cn(
                        'hover-decay flex h-10 items-center justify-between rounded-[var(--radius-menu-row)] px-3 text-body',
                        'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                        isCurrent
                          ? 'bg-[var(--selected-surface)] text-foreground shadow-[inset_2px_0_0_0_var(--selected-rail)]'
                          : 'text-foreground-secondary hover:bg-surface-sunken hover:text-foreground',
                      )}
                    >
                      {place.label}
                      {place.href === '/approvals' && held && held.count > 0 && (
                        <span className="tabular font-mono text-ledger text-approval-text">
                          {held.count} held
                        </span>
                      )}
                    </Link>
                    {place.children && (
                      <ul className="mb-1 ml-3 flex flex-col border-l border-line-subtle pl-2">
                        {place.children.map((child) => {
                          const childCurrent = onPath(pathname, child.href)
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                aria-current={childCurrent ? 'page' : undefined}
                                className={cn(
                                  'hover-decay flex h-9 items-center rounded-[var(--radius-menu-row)] px-3 text-ui',
                                  'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                                  childCurrent
                                    ? 'text-foreground'
                                    : 'text-foreground-muted hover:bg-surface-sunken hover:text-foreground',
                                )}
                              >
                                {child.label}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3 sm:hidden">
              <SovereigntyStatus />
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
