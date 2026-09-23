'use client'

import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown } from 'lucide-react'
import type { ModelDescriptor } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Base UI radio values cannot be null; this stands for "let the router pick". */
const AUTOMATIC = '__automatic__'

/** Models a person can meaningfully ask for: installed, and able to generate. */
export function selectableModels(models: readonly ModelDescriptor[] | null): ModelDescriptor[] {
  return (models || []).filter((m) => m.available && m.role !== 'embedding')
}

const ITEM = cn(
  'grid cursor-default grid-cols-[14px_minmax(0,1fr)] items-start gap-x-2 rounded-[var(--radius-menu-row)] px-2 py-1.5 outline-none select-none',
  'data-[highlighted]:bg-surface-sunken',
)

/**
 * Which model to ask for.
 *
 * "Automatic" is the default and the honest description of what happens
 * without a choice: the router picks per stage under policy. A named model
 * is a request with the same standing -- the router uses it for each stage
 * it is installed, approved and capable for, and the answer says wherever it
 * was not. The menu lists installed generation models only, because offering
 * one that cannot run would be offering a choice that does not exist.
 */
export function ModelMenu({
  models,
  error,
  value,
  onChange,
}: {
  /** From GET /api/models. Null until it answers. */
  models: ModelDescriptor[] | null
  error: string | null
  /** A registry id, or null for Automatic. */
  value: string | null
  onChange: (modelId: string | null) => void
}) {
  const options = selectableModels(models)
  const selected = options.find((m) => m.id === value)
  // Until the list arrives a remembered choice shows as its id rather than
  // silently as Automatic; it is only dropped once the list says it is gone.
  const label = selected ? selected.display_name : value && models === null ? value : 'Automatic'

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Model: ${label}`}
        className="hover-decay flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted hover:text-foreground-secondary focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none data-[popup-open]:bg-surface-sunken"
      >
        <span>Model</span>
        <span className="max-w-[16ch] truncate text-foreground">{label}</span>
        <ChevronDown className="size-3 shrink-0" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={6} className="z-[var(--z-menu)] outline-none">
          <Menu.Popup
            className={cn(
              'w-[300px] max-w-[calc(100vw-32px)] origin-[var(--transform-origin)] rounded-[var(--radius-md-token)] bg-surface p-[var(--menu-pad)] shadow-[var(--elev-2)] outline-none',
              'transition-[opacity,scale] duration-[var(--micro)] ease-[var(--ease-micro)]',
              'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
              'motion-safe:data-[starting-style]:scale-[0.98] motion-safe:data-[ending-style]:scale-[0.98]',
            )}
          >
            <Menu.RadioGroup
              value={value ?? AUTOMATIC}
              onValueChange={(next) => onChange(next === AUTOMATIC ? null : String(next))}
            >
              <Menu.RadioItem value={AUTOMATIC} closeOnClick className={ITEM}>
                <Menu.RadioItemIndicator className="col-start-1 mt-[3px]">
                  <Check className="size-3.5 text-foreground" aria-hidden />
                </Menu.RadioItemIndicator>
                <span className="col-start-2 flex flex-col">
                  <span className="text-ui text-foreground">Automatic</span>
                  <span className="text-meta text-foreground-muted">
                    The router picks for each stage, under policy
                  </span>
                </span>
              </Menu.RadioItem>

              {options.map((m) => (
                <Menu.RadioItem key={m.id} value={m.id} closeOnClick className={ITEM}>
                  <Menu.RadioItemIndicator className="col-start-1 mt-[3px]">
                    <Check className="size-3.5 text-foreground" aria-hidden />
                  </Menu.RadioItemIndicator>
                  <span className="col-start-2 flex min-w-0 flex-col">
                    <span className="truncate text-ui text-foreground">{m.display_name}</span>
                    <span className="truncate font-mono text-ledger text-foreground-muted">
                      {m.id} · {m.role}
                    </span>
                  </span>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>

            <p className="mt-1 border-t border-line-subtle px-2 pb-1 pt-2 text-meta text-foreground-muted">
              {error
                ? `The installed models could not be read: ${error}`
                : models === null
                  ? 'Reading the installed models…'
                  : options.length === 0
                    ? 'No generation model is installed on this host.'
                    : 'Used for each stage it is approved and capable for. Anywhere it is not, the router picks, and the answer says so.'}
            </p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
