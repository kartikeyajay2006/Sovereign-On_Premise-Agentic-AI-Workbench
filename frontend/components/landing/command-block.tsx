'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CARD, FOCUS, MONO_LABEL } from './tokens'

export interface CommandBlockProps {
  label: string
  /** Each entry is one shell line. `#` comments render at secondary ink. */
  lines: string[]
  className?: string
}

export function CommandBlock({ label, lines, className }: CommandBlockProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // The clipboard API is unavailable over plain HTTP in some browsers. Say
      // nothing and leave the text selectable -- it is a <pre>, not a widget.
    }
  }

  return (
    <div className={cn(CARD, 'overflow-hidden', className)}>
      <div className="flex h-9 items-center justify-between border-b border-border px-3">
        <span className={MONO_LABEL}>{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Commands copied' : 'Copy commands'}
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-[3px] px-2 font-mono text-meta text-foreground-secondary',
            // 24px visual, 40px hit area -- WCAG 2.2 SC 2.5.8 wants 24 and the
            // negative margin buys the rest without moving anything.
            'p-2 -m-2',
            'transition-colors duration-[150ms] hover:bg-surface-sunken hover:text-foreground hover:duration-0',
            'motion-reduce:transition-none',
            FOCUS,
          )}
        >
          {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-3 font-mono text-ui font-[425] leading-[22px] text-foreground">
        {lines.map((line, i) => (
          <div
            key={`${i}-${line}`}
            className={line.trimStart().startsWith('#') ? 'text-foreground-secondary' : undefined}
          >
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
