'use client'

import { memo } from 'react'
import { BookOpenText, Calculator, FileScan, Paperclip, ShieldAlert, Split, type LucideIcon } from 'lucide-react'
import { CONSOLE_TEMPLATES } from '@/lib/presentation'

export type StarterTemplate = (typeof CONSOLE_TEMPLATES)[number]

/** What each starter produces, said plainly, and the icon that stands for it. */
const CARD: Record<string, { icon: LucideIcon; blurb: string }> = {
  'golden-asset': { icon: FileScan, blurb: 'A scanned report in: figures by registered formulas, a cited approval note held for sign-off.' },
  'golden-asset-survey': { icon: Calculator, blurb: 'A thickness survey in: rates, remaining life and severity by registered formulas, not the model.' },
  'golden-conflict': { icon: Split, blurb: 'Two records give different readings: no figure is stated until a person chooses which governs.' },
  'golden-attack': { icon: ShieldAlert, blurb: 'The note tells the model to approve it. The order is withheld and a person reviews the run.' },
}

/** The sample files each card attaches, by the id config/app.yaml gives them. */
const SAMPLE_NAMES: Record<string, string> = {
  'v2104-scan': 'scanned-inspection-report-V-2104.pdf',
  'v2104-survey': 'V-2104-thickness-survey.csv',
  'v2104-field-sheet': 'V-2104-contractor-field-sheet.md',
  'v2104-injected-note': 'V-2104-contractor-note-with-injection.md',
}

/**
 * The three golden demos, for an empty thread.
 *
 * A card fills the composer and attaches its sample files through the
 * ordinary upload, so the run starts from exactly what a person would send.
 * Nothing is dispatched until Run is pressed.
 */
export const StarterPrompts = memo(function StarterPrompts({
  onPick,
  visionReady = false,
}: {
  onPick: (template: StarterTemplate) => void
  /** A vision model is installed, so a scanned report can be read here. */
  visionReady?: boolean
}) {
  // Three cards: the scanned report where a vision model can read it, the
  // survey where it cannot.
  const shown = CONSOLE_TEMPLATES.filter((t) => (t.needs === 'vision' ? visionReady : t.needs === 'no-vision' ? !visionReady : true))
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
              {template.samples.length > 0 ? (
                <span className="mt-auto flex flex-col gap-0.5 pt-1 text-[11.5px] text-foreground-muted">
                  {template.samples.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5">
                      <Paperclip className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{SAMPLE_NAMES[id] ?? id}</span>
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
})
