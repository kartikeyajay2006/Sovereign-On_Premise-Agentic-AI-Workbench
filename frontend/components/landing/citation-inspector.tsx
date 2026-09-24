'use client'

import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { Marquee } from './marquee'
import { Passage, type PassageMark } from './passage'
import { FOCUS, MONO_LABEL, MONO_META } from './tokens'

/** One retrieved passage, already reduced to what the inspector prints. */
export interface InspectorSource {
  id: string
  rank: number
  cited: boolean
  /** "SOP-INS-014" */
  code: string
  /** "§5. Findings Classification" */
  section: string
  /** "Pressure Vessel External and Internal Inspection" */
  title: string
  /** Cosine similarity to the question. Null prints nothing, never a default. */
  score: number | null
  classification: string
  excerpt: string
}

/**
 * The page's own reading of this run, as opposed to anything the run said.
 * Present only when the fixture is the run it was written about; the page
 * checks the task id before passing it, so a re-captured run shows no note
 * about a sentence it does not contain.
 */
export interface InspectorAnnotation {
  /** Boxed words, per source id. */
  marks: Record<string, PassageMark>
  /** Enough of the sentence to find it: the note attaches to the one containing this. */
  sentence: string
  note: string
  more: { label: string; href: string }
  attribution: string
  legend: string
}

export interface InspectorLabels {
  question: string
  answer: string
  hint: string
  cited: string
  uncited: string
  similarity: string
  rank: string
  rendered: string
  stored: string
  sources: string
}

export interface CitationInspectorProps {
  /** "tsk_5aa3e4b6 · 22 Sep 2026" */
  runLabel: string
  outcome: { label: string; tone: 'held' | 'released' | 'refused' | 'other' }
  /** Measured facts for the run header, e.g. "3 of 4 checks passed", "195.2 s". */
  facts: string[]
  question: string
  askedAt: string | null
  answer: string
  sources: InspectorSource[]
  annotation: InspectorAnnotation | null
  labels: InspectorLabels
  className?: string
}

const CITATION = /(\[[SFVCE]\d+\])/g

const TONE: Record<CitationInspectorProps['outcome']['tone'], string> = {
  held: 'text-approval-text',
  released: 'text-sovereign-text',
  refused: 'text-critical-text',
  other: 'text-foreground-secondary',
}

/**
 * Splits at a full stop, question or exclamation mark followed by whitespace,
 * which is the rule backend/agents/verifier.py uses to find claims. "section
 * 4.1." splits after the second full stop and not inside the number, because
 * the first is followed by a digit.
 */
function sentences(paragraph: string): string[] {
  const out: string[] = []
  let start = 0
  for (let i = 0; i < paragraph.length; i += 1) {
    if ('.!?'.includes(paragraph[i]) && /\s/.test(paragraph[i + 1] ?? '')) {
      out.push(paragraph.slice(start, i + 1))
      start = i + 1
      while (start < paragraph.length && /\s/.test(paragraph[start])) start += 1
      i = start - 1
    }
  }
  if (start < paragraph.length) out.push(paragraph.slice(start))
  return out
}

/** **bold** only, as the console renders it. Text nodes, never parsed HTML. */
function Emphasis({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*\n]+\*\*)/g)
        .filter(Boolean)
        .map((part, i) =>
          /^\*\*[^*\n]+\*\*$/.test(part) ? (
            <strong key={i} className="font-medium">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          ),
        )}
    </>
  )
}

function duration(node: HTMLElement, token: string, fallback: number): number {
  const value = parseFloat(getComputedStyle(node).getPropertyValue(token))
  return Number.isFinite(value) ? value : fallback
}

/**
 * The product's signature gesture, with the product's own data: press a
 * citation in an answer and read the passage it points at.
 *
 * This is not a screenshot and not a mock. The question, the answer, every
 * passage and its similarity score are the run record exported by
 * scripts/capture_landing_fixture.py, and the passage is the chunk retrieval
 * returned, rendered -- with the stored text one toggle away, so the rendering
 * can be checked against the record too.
 *
 * Interaction, not motion, is what this section adds, so nothing here moves
 * until the reader does something. When they change the open passage it
 * settles into place on the spatial tier; under reduced motion it simply
 * changes.
 */
export function CitationInspector({
  runLabel,
  outcome,
  facts,
  question,
  askedAt,
  answer,
  sources,
  annotation,
  labels,
  className,
}: CitationInspectorProps) {
  const uid = useId()
  const panelId = `${uid}-passage`
  const noteId = `${uid}-note`
  const tabId = (id: string) => `${uid}-tab-${id}`

  const byId = new Map(sources.map((source) => [source.id, source]))
  const cited = sources.filter((source) => source.cited)
  const uncited = sources.filter((source) => !source.cited)
  const order = [...cited, ...uncited]

  // The first passage the answer cites, in the order it cites them, so the
  // pane opens on what the first marker in the prose points at.
  const firstCited = (answer.match(CITATION) ?? [])
    .map((marker) => marker.slice(1, -1))
    .find((id) => byId.has(id))
  const [active, setActive] = useState<string>(firstCited ?? order[0]?.id ?? '')
  const [view, setView] = useState<'rendered' | 'stored'>('rendered')
  // What the live region says. Empty until the reader acts, so loading the
  // page announces nothing.
  const [announcement, setAnnouncement] = useState('')

  const panelRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  // Motion only answers a pointer action. The first render is not one, and
  // neither is a change made from the keyboard -- arrows through the tabs,
  // Enter on a marker -- which lands at once, because a keyboard-caused
  // change never waits on an animation.
  const acted = useRef(false)

  useEffect(() => {
    const node = bodyRef.current
    if (!acted.current || !node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // The reader opened another passage or view: it settles into place at
    // full opacity. Only its position moves, never the ink.
    node.animate([{ transform: 'translateY(6px)' }, { transform: 'none' }], {
      duration: duration(node, '--spatial', 300),
      easing: getComputedStyle(node).getPropertyValue('--ease-spatial').trim() || 'ease-out',
    })
  }, [active, view])

  /** `pointer` is false for a change the keyboard made. */
  const select = (id: string, from: 'marker' | 'tab', pointer: boolean) => {
    acted.current = pointer
    setActive(id)
    const source = byId.get(id)
    if (source) setAnnouncement(`${source.id}: ${source.code} ${source.section}`)
    if (from !== 'marker') return
    // Below the two-column breakpoint the pane sits under the answer. A marker
    // press that changed something off-screen would read as a press that did
    // nothing, so the pane is brought up -- but only when it starts in the
    // bottom quarter of the screen or below it, never as a reflex. A pane whose
    // top is above the screen can only be the side-by-side layout, where the
    // passage is already beside the marker and scrolling would take the
    // marker away.
    window.requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const top = panel.getBoundingClientRect().top
      if (top > window.innerHeight * 0.72) {
        // A keyboard press is taken there at once, like any change it causes.
        // 'instant', not 'auto': 'auto' defers to the page's own smooth
        // scroll-behavior and would glide anyway.
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        panel.scrollIntoView({ block: 'start', behavior: !pointer ? 'instant' : still ? 'auto' : 'smooth' })
      }
    })
  }

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = order.findIndex((source) => source.id === active)
    if (index === -1) return
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? order[(index + 1) % order.length]
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? order[(index - 1 + order.length) % order.length]
          : event.key === 'Home'
            ? order[0]
            : event.key === 'End'
              ? order[order.length - 1]
              : null
    if (!next) return
    event.preventDefault()
    select(next.id, 'tab', false)
    tabRefs.current.get(next.id)?.focus()
  }

  const current = byId.get(active) ?? null
  const mark = current && annotation ? (annotation.marks[current.id] ?? null) : null

  const paragraphs = answer.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0)

  const tab = (source: InspectorSource) => {
    const selected = source.id === active
    return (
      <button
        key={source.id}
        ref={(node) => {
          if (node) tabRefs.current.set(source.id, node)
          else tabRefs.current.delete(source.id)
        }}
        id={tabId(source.id)}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={panelId}
        aria-label={`${source.id}, ${source.code} ${source.section}, ${source.cited ? labels.cited : labels.uncited}`}
        tabIndex={selected ? 0 : -1}
        // A click the keyboard synthesised (Enter, Space) reports detail 0.
        onClick={(event) => select(source.id, 'tab', event.detail !== 0)}
        className={cn(
          'relative inline-flex h-8 min-w-9 items-center justify-center rounded-[3px] px-2 font-mono text-meta',
          'pointer-coarse:h-11 pointer-coarse:min-w-11',
          'transition-[background-color,color,box-shadow] duration-[var(--micro)] ease-[var(--ease-micro)] hover:duration-0 motion-reduce:transition-none',
          // Selection is ink: the product's rule, so "open" never reads as "verified".
          selected
            ? 'bg-[var(--selected-surface)] text-foreground shadow-[inset_0_-2px_0_0_var(--foreground)]'
            : source.cited
              ? 'text-foreground-secondary hover:bg-[var(--selected-surface)] hover:text-foreground'
              : 'text-foreground-muted hover:bg-[var(--selected-surface)] hover:text-foreground',
          FOCUS,
        )}
      >
        {source.id}
      </button>
    )
  }

  return (
    <div className={cn('overflow-hidden rounded-[var(--radius-lg-token)] bg-background shadow-[var(--elev-2)]', className)}>
      {/* The run header: the same three facts, in the same order, as the console's. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-default px-4 py-2.5 md:px-5">
        <span className={cn(MONO_META, 'min-w-0 truncate')}>{runLabel}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-meta">
          <span className={cn('font-medium uppercase tracking-[var(--ls-meta)]', TONE[outcome.tone])}>
            {outcome.label}
          </span>
          {facts.map((fact) => (
            <span key={fact} className="tabular text-foreground-secondary">
              {fact}
            </span>
          ))}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        {/* ── The turn ────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
          <div className="border-l-2 border-line-strong bg-surface px-4 py-3">
            <p className={MONO_LABEL}>{labels.question}</p>
            <p className="mt-1.5 text-answer text-foreground">{question}</p>
            {askedAt ? <p className={cn(MONO_META, 'mt-2')}>{askedAt}</p> : null}
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className={MONO_LABEL}>{labels.answer}</p>
              <p className={MONO_META}>{labels.hint}</p>
            </div>

            <div className="mt-3 flex flex-col gap-4">
              {paragraphs.map((paragraph, p) => (
                <p key={p} className="m-0 text-answer leading-[26px] text-foreground">
                  {sentences(paragraph).map((sentence, s) => {
                    const lit = sentence.includes(`[${active}]`)
                    const annotated = annotation !== null && sentence.includes(annotation.sentence)
                    return (
                      <Fragment key={s}>
                        {s > 0 ? ' ' : null}
                        <span
                          className={cn(
                            'rounded-[2px] transition-[background-color] duration-[var(--standard)] ease-[var(--ease-standard)] motion-reduce:transition-none',
                            '[box-decoration-break:clone] [-webkit-box-decoration-break:clone]',
                            lit && 'bg-[var(--selected-surface)]',
                          )}
                        >
                          {sentence.split(CITATION).map((part, i) => {
                            const match = /^\[([SFVCE]\d+)\]$/.exec(part)
                            if (!match) return <Emphasis key={i} text={part} />
                            const id = match[1]
                            const source = byId.get(id)
                            if (!source) {
                              // A marker with no passage behind it is a finding
                              // about the answer, so it is marked, not linked.
                              return (
                                <span
                                  key={i}
                                  title={`No passage with id ${id} was recorded for this run.`}
                                  className="mx-[2px] align-[0.3em] font-mono text-meta text-critical-text underline decoration-dotted underline-offset-2"
                                >
                                  {id}
                                </span>
                              )
                            }
                            const pressed = id === active
                            return (
                              <button
                                key={i}
                                type="button"
                                aria-pressed={pressed}
                                aria-controls={panelId}
                                aria-label={`Open ${id}: ${source.code} ${source.section}`}
                                onClick={(event) => select(id, 'marker', event.detail !== 0)}
                                className={cn(
                                  // 18px tall and raised 0.2em, sized to sit
                                  // inside the 26px line rather than push it
                                  // apart. If a line carrying a marker ever
                                  // renders taller than its neighbours, lower
                                  // the raise before shrinking the target.
                                  'relative mx-[2px] inline-flex h-[18px] min-w-[26px] items-center justify-center rounded-[3px] px-1 align-[0.2em] font-mono text-meta font-medium leading-none',
                                  // A 44px target on touch without moving a pixel of the line.
                                  "before:absolute before:-inset-1 before:content-[''] pointer-coarse:before:-inset-x-2 pointer-coarse:before:-inset-y-3",
                                  'transition-[background-color,color] duration-[var(--micro)] ease-[var(--ease-micro)] hover:duration-0 motion-reduce:transition-none',
                                  // Lime is this section's one "press here". Once
                                  // pressed the marker is a selection, and
                                  // selection is ink.
                                  pressed
                                    ? 'bg-foreground text-background'
                                    : 'bg-action-wash text-action hover:bg-action hover:text-action-ink',
                                  FOCUS,
                                )}
                              >
                                {id}
                              </button>
                            )
                          })}
                        </span>
                        {annotated ? (
                          <a
                            href={`#${noteId}`}
                            aria-label="Note on this sentence"
                            className={cn(
                              'relative ml-0.5 align-[0.3em] font-serif text-body text-foreground-secondary hover:text-foreground',
                              "before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-[''] pointer-coarse:before:-inset-3",
                              FOCUS,
                            )}
                          >
                            †
                          </a>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </p>
              ))}
            </div>
          </div>

          {annotation ? (
            <aside id={noteId} aria-label="Note on the answer" className="scroll-mt-24 border-t border-line-subtle pt-4">
              {/*
                The serif italic is the page's human voice -- the same face
                that carries the turn of every heading. It is used here because
                this paragraph is a person's reading of the answer, and it must
                not be mistaken for anything the system reported.
              */}
              <p className="m-0 font-serif text-heading italic text-foreground-secondary">
                <span aria-hidden className="not-italic">† </span>
                {annotation.note}{' '}
                <a
                  href={annotation.more.href}
                  className={cn('text-foreground underline decoration-line-strong underline-offset-[3px] hover:decoration-foreground', FOCUS)}
                >
                  {annotation.more.label}
                </a>
              </p>
              <p className={cn(MONO_META, 'mt-2')}>{annotation.attribution}</p>
            </aside>
          ) : null}
        </div>

        {/* ── The passage ─────────────────────────────────────────────── */}
        <div
          ref={panelRef}
          className="flex min-w-0 scroll-mt-20 flex-col border-t border-line-default bg-surface-sunken lg:border-l lg:border-t-0"
        >
          <div
            role="tablist"
            aria-label={labels.sources}
            onKeyDown={onTabKey}
            className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-line-subtle px-3 py-2 md:px-4"
          >
            <span aria-hidden className={cn(MONO_META, 'mr-1.5')}>
              {labels.cited}
            </span>
            {cited.map(tab)}
            {uncited.length > 0 ? (
              <>
                <span aria-hidden className="mx-2 h-4 w-px bg-line-default" />
                <span aria-hidden className={cn(MONO_META, 'mr-1.5')}>
                  {labels.uncited}
                </span>
                {uncited.map(tab)}
              </>
            ) : null}
          </div>

          {current ? (
            <div
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId(current.id)}
              // No tabIndex: the panel holds its own focusable controls, and
              // the tabs pattern only makes a panel a tab stop when it has none.
              className="flex flex-1 flex-col gap-4 px-4 py-5 md:px-6"
            >
              <div className="flex flex-col gap-1">
                <p className="m-0 flex flex-wrap items-baseline gap-x-2 font-mono text-ui">
                  <span className="text-foreground">{current.code}</span>
                  <span className="text-foreground-secondary">{current.section}</span>
                </p>
                <p className="m-0 text-body text-foreground-secondary">{current.title}</p>
                <p className={cn(MONO_META, 'mt-1 flex flex-wrap gap-x-3 gap-y-0.5')}>
                  {/* Printed only when measured. */}
                  {current.score !== null ? (
                    <span className="tabular">
                      {labels.similarity} {current.score.toFixed(4)}
                    </span>
                  ) : null}
                  <span className="tabular">
                    {labels.rank} {current.rank} of {sources.length}
                  </span>
                  <span>{current.classification}</span>
                  <span>{current.cited ? labels.cited : labels.uncited}</span>
                </p>
              </div>

              <div
                role="group"
                aria-label="Passage view"
                className="flex w-fit items-center rounded-[4px] p-0.5 shadow-[0_0_0_1px_var(--control-default)]"
              >
                {(['rendered', 'stored'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={view === mode}
                    onClick={(event) => {
                      acted.current = event.detail !== 0
                      setView(mode)
                    }}
                    className={cn(
                      'h-7 rounded-[3px] px-2.5 font-mono text-meta pointer-coarse:h-10',
                      'transition-[background-color,color] duration-[var(--micro)] ease-[var(--ease-micro)] hover:duration-0 motion-reduce:transition-none',
                      view === mode
                        ? 'bg-[var(--selected-surface)] text-foreground'
                        : 'text-foreground-secondary hover:text-foreground',
                      FOCUS,
                    )}
                  >
                    {mode === 'rendered' ? labels.rendered : labels.stored}
                  </button>
                ))}
              </div>

              <div ref={bodyRef} className="min-w-0">
                {view === 'rendered' ? (
                  <Passage excerpt={current.excerpt} mark={mark} />
                ) : (
                  <pre className="m-0 whitespace-pre-wrap break-words font-mono text-ui leading-[20px] text-foreground-secondary">
                    {current.excerpt}
                  </pre>
                )}
              </div>

              {mark && annotation && view === 'rendered' ? (
                <p className="m-0 mt-auto flex items-start gap-3 border-t border-line-subtle pt-4 text-ui leading-[18px] text-foreground-secondary">
                  {/* The key to the box, drawn as the box. Hidden from assistive
                      technology: the sentence beside it says the same thing. */}
                  <span aria-hidden className="mt-0.5 shrink-0">
                    <Marquee className="h-3.5 w-6" />
                  </span>
                  <span>{annotation.legend}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Announces the open passage after a change; the first render is silent. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
