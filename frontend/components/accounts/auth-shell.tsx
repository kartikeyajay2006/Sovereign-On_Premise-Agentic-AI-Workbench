'use client'

import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Wordmark } from '@/components/landing/wordmark'
import { cn } from '@/lib/utils'

/**
 * The frame every door into the workbench shares: sign-in, owner setup,
 * invitation, reset and access request.
 *
 * Hi-Vis Monochrome, the whole of it: a faint vertical grid on the night
 * ground, the wordmark and the theme at the top, one narrow column, a Martian
 * Mono label voice and one lime action. The brand panel the old sign-in had
 * is gone: on an air-gapped host the person at this screen already knows what
 * the product is, and the column is all the page needs to say.
 */
export function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="hv-auth flex flex-col">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          aria-label="AEGIS — home"
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 justify-center px-4 pb-16 pt-8 sm:px-5 sm:pt-16">
        <div className="w-full max-w-[420px]">
          {children}
          {footer && <div className="mt-12 flex flex-col gap-3 border-t border-line-subtle pt-5">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

/** The label voice over a display heading: "SIGN IN TO", "OWNER SETUP · STEP 1 OF 2". */
export function AuthHeading({ label, title, lede }: { label: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div>
      <p className="hv-label m-0">{label}</p>
      <h1 className="hv-display mt-3 text-balance">{title}</h1>
      {lede && <p className="mt-4 text-[0.92rem] leading-[1.55] text-foreground-secondary">{lede}</p>}
    </div>
  )
}

type FieldProps = {
  label: string
  /** One quiet line under the field: a rule, not an error. */
  hint?: ReactNode
  error?: string
  /** Right-aligned on the label row, e.g. a reveal toggle. */
  action?: ReactNode
  mono?: boolean
  ref?: Ref<HTMLInputElement>
}

export function Field({
  label,
  hint,
  error,
  action,
  mono,
  className,
  id,
  ref,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId()
  const fieldId = id ?? `hv-${generated}`
  const note = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={fieldId} className="hv-label">
          {label}
        </label>
        {action}
      </div>
      <input
        {...props}
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={note}
        className={cn('hv-input', mono && 'mono', className)}
      />
      {error ? (
        <p id={note} className="m-0 text-[0.82rem] text-critical-text">
          {error}
        </p>
      ) : hint ? (
        <p id={note} className="m-0 text-[0.8rem] leading-[1.5] text-foreground-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function TextField({
  label,
  hint,
  id,
  ...props
}: { label: string; hint?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId()
  const fieldId = id ?? `hv-${generated}`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="hv-label">
        {label}
      </label>
      <textarea {...props} id={fieldId} aria-describedby={hint ? `${fieldId}-hint` : undefined} className="hv-input" />
      {hint && (
        <p id={`${fieldId}-hint`} className="m-0 text-[0.8rem] leading-[1.5] text-foreground-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  id,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  id?: string
}) {
  const generated = useId()
  const fieldId = id ?? `hv-${generated}`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="hv-label">
        {label}
      </label>
      <select id={fieldId} value={value} onChange={(e) => onChange(e.target.value)} className="hv-input">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** The one lime action. Busy keeps its width and says what it is doing. */
export function ActionButton({
  children,
  busy,
  busyLabel,
  className,
  type = 'submit',
  ...props
}: { busy?: boolean; busyLabel?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type={type}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={cn('hv-btn w-full', className)}
    >
      {busy ? (
        <>
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          {busyLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  )
}

/** A refusal, in the service's words, where the person is looking. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 border-l-2 border-critical pl-3 text-[0.86rem] leading-[1.5] text-critical-text">
      {children}
    </p>
  )
}

/** The quiet line every door ends with: what happens to what you type here. */
export function RecordedNote({ children }: { children?: ReactNode }) {
  return (
    <p className="hv-label m-0">
      {children ?? 'Every sign-in is recorded.'}
    </p>
  )
}

/** "Checked 11:32:05": a time of reading, for a line that re-reads. */
export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
