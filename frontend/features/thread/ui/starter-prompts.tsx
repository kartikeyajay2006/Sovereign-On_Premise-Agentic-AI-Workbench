'use client'

import { memo } from 'react'
import { BookOpenText, Calculator, FileScan, Paperclip, Quote, type LucideIcon } from 'lucide-react'
import { CONSOLE_TEMPLATES } from '@/lib/presentation'

export type StarterTemplate = (typeof CONSOLE_TEMPLATES)[number]

/** What each starter produces, said plainly, and the icon that stands for it. */
const CARD: Record<string, { icon: LucideIcon; blurb: string }> = {
  'approval-note': { icon: FileScan, blurb: 'Scanned PDF in, a cited Word approval note out, held for sign-off.' },
  'corrosion-calc': { icon: Calculator, blurb: 'Survey CSV in, rates and remaining life computed in the sandbox.' },
  'procedure-question': { icon: BookOpenText, blurb: 'A cited answer from your procedures, checked before release.' },
  'clause-skill': { icon: Quote, blurb: 'The /clause skill, ready to run: the clause that governs, cited and checked.' },
}

/**
 * Three real requests to start from, for an empty thread.
 *
 * They fill the composer and nothing else. Two of them are about a file, and
 * choosing one does not pretend to have attached it -- the composer names the
 * sample file to attach, because a prompt that says "the attached report"
 * dispatched with no report would send the model looking for a document that
 * is not there.
 */
export const StarterPrompts = memo(function StarterPrompts({
  onPick,
  visionReady = false,
}: {
  onPick: (template: StarterTemplate) => void
  /** A vision model is installed, so a scanned report can be read here. */
  visionReady?: boolean
}) {
  // Three cards: the scanned report where it can run, the skill where not.
  const shown = CONSOLE_TEMPLATES.filter((t) => (t.needs === 'vision' ? visionReady : t.id !== 'clause-skill' || !visionReady))
  return (
    <ul aria-label="Starter requests" className="grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-3">
      {shown.map((template, i) => {
        const card = CARD[template.id]
        const Icon = card?.icon ?? BookOpenText
        return (
          <li key={template.id} className="thread-starter" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <button
              type="button"
              onClick={() => onPick(template)}
              className="group flex h-full w-full flex-col items-start gap-2.5 rounded-[18px] border border-line-subtle bg-surface p-4 text-left shadow-[0_1px_2px_oklch(0_0_0/0.03)] transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-spatial)] hover:-translate-y-0.5 hover:border-line-default hover:shadow-[0_10px_30px_-16px_oklch(0_0_0/0.25)] focus-visible:shadow-[var(--focus-ring-on-paper)] focus-visible:outline-none active:translate-y-0"
            >
              <span className="grid size-8 place-items-center rounded-[10px] bg-surface-sunken text-foreground-secondary transition-colors group-hover:bg-foreground group-hover:text-background">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="text-[14px] font-medium leading-[1.35] text-foreground">
                {template.skill ? <span className="mr-1.5 font-mono text-foreground-secondary">/{template.skill}</span> : null}
                {template.title}
              </span>
              <span className="text-[12.5px] leading-[1.5] text-foreground-muted">{card?.blurb}</span>
              {template.attach ? (
                <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-[11.5px] text-foreground-muted">
                  <Paperclip className="size-3" aria-hidden />
                  {template.attach.split('/').pop()}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
})

/** The file name a starter expects, from its sample-data path. */
export function starterAttachment(template: StarterTemplate): { name: string; path: string } | null {
  if (!template.attach) return null
  const name = template.attach.split('/').pop() || template.attach
  return { name, path: template.attach }
}
