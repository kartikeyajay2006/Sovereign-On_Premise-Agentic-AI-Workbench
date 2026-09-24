'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { FileText, Layers, Sparkles } from 'lucide-react'
import type { Skill } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface HarnessEntry {
  id: string
  name: string
  summary: string
}

export type SlashItem =
  | { kind: 'skill'; key: string; skill: Skill }
  | { kind: 'harness'; key: string; harness: HarnessEntry }

/** What "/query" offers: skills first, then the harnesses that fan out into many runs. */
export function slashItems(
  query: string,
  skills: readonly Skill[] | null | undefined,
  harnesses: readonly HarnessEntry[] | null | undefined,
): SlashItem[] {
  const q = query.toLowerCase()
  const hit = (...fields: (string | null | undefined)[]) => fields.some((f) => f?.toLowerCase().includes(q))
  return [
    ...(skills ?? [])
      .filter((s) => hit(s.id, s.name))
      .map((skill): SlashItem => ({ kind: 'skill', key: `skill:${skill.id}`, skill })),
    ...(harnesses ?? [])
      .filter((h) => hit(h.id, h.name))
      .map((harness): SlashItem => ({ kind: 'harness', key: `harness:${harness.id}`, harness })),
  ]
}

/**
 * The menu "/" opens above the composer: every skill, then every harness.
 *
 * Skills and harnesses are the two ways to reuse a request, and they are
 * listed together because they compose: a skill is one run with a saved
 * instruction, a harness is many runs gathered into one report. Neither can
 * do anything a typed request could not -- the footer says so, since that is
 * the reason either is safe to hand to anyone.
 */
export function SlashMenu({
  id,
  query,
  items,
  highlight,
  onHighlight,
  onChoose,
  placement = 'above',
}: {
  id: string
  query: string
  items: SlashItem[]
  highlight: number
  onHighlight: (index: number) => void
  onChoose: (item: SlashItem) => void
  /** Above a composer docked at the foot of a thread; below one in the empty state. */
  placement?: 'above' | 'below'
}) {
  const listRef = useRef<HTMLUListElement | null>(null)

  // Keep the highlighted row in view as the arrow keys move it.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const firstHarness = items.findIndex((item) => item.kind === 'harness')

  return (
    <div
      className={cn(
        'ae-slash absolute inset-x-0 z-[var(--z-menu)] overflow-hidden rounded-[18px] border border-line-subtle bg-surface shadow-[var(--elev-2)]',
        placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
      )}
    >
      {items.length === 0 ? (
        <p className="px-4 py-3.5 text-[13px] text-foreground-secondary">
          No skill or harness named <span className="font-mono text-foreground">/{query}</span>.{' '}
          <Link href="/skills" className="text-foreground underline underline-offset-2">
            Add one
          </Link>
        </p>
      ) : (
        <ul id={id} ref={listRef} role="listbox" aria-label="Skills and harnesses" className="max-h-[320px] overflow-y-auto p-1.5">
          {items.map((item, index) => {
            const heading =
              index === 0 && item.kind === 'skill'
                ? 'Skills · one run, a saved instruction'
                : index === firstHarness
                  ? 'Harnesses · many runs, one report'
                  : null
            const active = index === highlight
            return [
              heading && (
                <li key={`h-${item.key}`} role="presentation" className="px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-foreground-muted">
                  {heading}
                </li>
              ),
              <li
                key={item.key}
                id={`${id}-${index}`}
                role="option"
                aria-selected={active}
                data-index={index}
                onMouseMove={() => onHighlight(index)}
                onMouseDown={(e) => {
                  // Keep the caret in the field: the choice is applied there.
                  e.preventDefault()
                  onChoose(item)
                }}
                className={cn(
                  'grid cursor-default grid-cols-[20px_minmax(0,1fr)] items-start gap-x-2.5 rounded-[12px] px-2.5 py-2',
                  active && 'bg-surface-sunken',
                )}
              >
                <span aria-hidden className="mt-[3px] grid size-5 place-items-center text-foreground-muted">
                  {item.kind === 'harness' ? (
                    <Layers className="size-4" />
                  ) : item.skill.deliverable_format ? (
                    <FileText className="size-4" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-[13px] text-foreground">
                      /{item.kind === 'skill' ? item.skill.id : item.harness.id}
                    </span>
                    <span className="truncate text-[13px] text-foreground-secondary">
                      {item.kind === 'skill' ? item.skill.name : item.harness.name}
                    </span>
                    {item.kind === 'skill' && item.skill.source === 'custom' && (
                      <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 text-[11px] text-foreground-muted">
                        {item.skill.author_display_name || item.skill.author || 'custom'}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-foreground-muted">
                    {item.kind === 'skill' ? item.skill.summary : item.harness.summary}
                  </span>
                </span>
              </li>,
            ]
          })}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line-subtle px-4 py-2 text-[12px] text-foreground-muted">
        <span>Each changes only what a run is asked. Every run still meets every check.</span>
        <Link href="/skills" className="shrink-0 font-medium text-foreground-secondary hover:text-foreground">
          Manage skills
        </Link>
      </div>
    </div>
  )
}
