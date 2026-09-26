'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { LABEL, MONO } from './style'

/**
 * The report's place on the audit chain, sealed.
 *
 * `seq` and `hash` are the sequence and hash of the report_generated audit
 * record for this version -- read from the report record, or from the
 * harness.report_written event in the moment before the re-read lands.
 * Neither is ever computed here. When they are absent (auditing off, or a
 * report written before the head was kept) that is what is said.
 *
 * SEAL runs once, when this version is released while the page watches:
 * the hex resolves left to right, the lime rule wipes in, then the SEALED
 * stamp. A version that was already released when the page opened is
 * drawn sealed, still. A version held for sign-off is not sealed at all.
 */
export function AuditSeal({
  seq,
  hash,
  released,
  animate,
}: {
  seq: number | null
  hash: string | null
  released: boolean
  animate: boolean
}) {
  if (hash === null || seq === null) {
    return (
      <p className={cn(LABEL, 'normal-case tracking-normal')}>
        No audit head is recorded for this version: auditing was off when it was written, or it was written before the
        head was kept.
      </p>
    )
  }
  const chars = hash.split('')
  return (
    <div
      className={cn('flex flex-col gap-1.5', released && animate && 'hv-seal')}
      style={{ '--n': chars.length } as CSSProperties}
    >
      <span className={cn(LABEL, 'flex items-center justify-between gap-2')}>
        <span>
          audit head · seq <span className="text-foreground">{seq}</span>
        </span>
        {released ? (
          <span className="hv-seal-stamp border border-action px-1.5 font-mono text-[11px] leading-4 tracking-[0.12em] text-action">
            SEALED
          </span>
        ) : (
          <span className="border border-dashed border-[var(--hv-held)] px-1.5 text-[var(--hv-held)]">held · not sealed</span>
        )}
      </span>
      <code className={cn(MONO, 'block break-all text-foreground')} aria-label={`audit hash ${hash}`}>
        {chars.map((char, index) => (
          <span key={index} aria-hidden className="hv-seal-char" style={{ '--i': index } as CSSProperties}>
            {char}
          </span>
        ))}
      </code>
      {released ? (
        <span aria-hidden className="hv-seal-rule" />
      ) : (
        <span aria-hidden className="block h-px border-t border-dashed border-foreground-muted" />
      )}
    </div>
  )
}
