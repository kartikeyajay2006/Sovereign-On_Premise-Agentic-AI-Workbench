'use client'

import { memo } from 'react'
import { Paperclip } from 'lucide-react'
import { CONSOLE_TEMPLATES } from '@/lib/presentation'

export type StarterTemplate = (typeof CONSOLE_TEMPLATES)[number]

/**
 * Three real requests to start from, for an empty thread.
 *
 * Quiet on purpose: they fill the composer and nothing else. Two of them are
 * about a file, and choosing one does not pretend to have attached it -- the
 * composer names the sample file to attach, because a prompt that says "the
 * attached report" dispatched with no report would send the model looking
 * for a document that is not there.
 */
export const StarterPrompts = memo(function StarterPrompts({
  onPick,
}: {
  onPick: (template: StarterTemplate) => void
}) {
  return (
    <ul aria-label="Starter requests" className="flex list-none flex-wrap justify-center gap-2 p-0">
      {CONSOLE_TEMPLATES.map((template) => (
        <li key={template.id}>
          <button
            type="button"
            onClick={() => onPick(template)}
            className="flex h-9 items-center gap-2 rounded-full border border-line-subtle bg-transparent px-4 text-[13.5px] text-foreground-secondary transition-[background-color,border-color,color] duration-150 hover:border-line-default hover:bg-surface hover:text-foreground focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none"
          >
            {template.attach && <Paperclip className="size-3.5 shrink-0 text-foreground-muted" aria-hidden />}
            {template.title}
          </button>
        </li>
      ))}
    </ul>
  )
})

/** The file name a starter expects, from its sample-data path. */
export function starterAttachment(template: StarterTemplate): { name: string; path: string } | null {
  if (!template.attach) return null
  const name = template.attach.split('/').pop() || template.attach
  return { name, path: template.attach }
}
