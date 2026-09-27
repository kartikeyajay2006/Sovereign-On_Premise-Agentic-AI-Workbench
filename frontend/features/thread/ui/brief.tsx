'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { AssistantTurn } from '../model/types'
import { crewSignature, modelsUsed, stampOf, type AnswerShape } from '../model/brief'
import { CITE_CHIP } from './cite-chip'
import { CiteButton } from './evidence-card'
import { Inline } from './inline'
import { citeLabel } from './run-transcript'

/**
 * The Brief: a checked prose answer, typeset.
 *
 * The lede is the answer's first sentence, which the model is asked to
 * write as a direct, cited answer and the verifier checks like any other
 * claim; the rest are numbered claims. The margin lists what the answer
 * cites, and the sign-off says how the run ended, who worked on it, how
 * long it took and on which models. Every part is read from the record.
 *
 * Motion only when the answer was released while the reader watched, and
 * never under reduced motion: lede and claims rise 8px on a 40ms stagger,
 * the stamp lands once on the lock curve after them, and the crew ticks on
 * in order. Reopened from the record, it is simply there.
 */

/** Rows past this rise together, so a long answer does not keep arriving. */
const STAGGER_CAP = 8
const STAGGER_MS = 40
/** The rise, matched to .brief-rise in globals.css. */
const RISE_MS = 420

type Brief = Extract<AnswerShape, { kind: 'brief' }>

const STAMP_TONE = {
  ok: 'brief-stamp-ok',
  held: 'brief-stamp-held',
  critical: 'brief-stamp-critical',
  neutral: 'brief-stamp-neutral',
} as const

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` }
}

function rise(index: number): CSSProperties {
  return delay(Math.min(index, STAGGER_CAP) * STAGGER_MS)
}

export function BriefAnswer({
  turn,
  brief,
  onCite,
  live,
}: {
  turn: AssistantTurn
  brief: Brief
  onCite: (id: string) => void
  /** Released while watched, and motion allowed. */
  live: boolean
}) {
  const known = new Set(turn.evidence.map((e) => e.id))
  const stamp = stampOf(turn)
  const crew = crewSignature(turn)
  const models = modelsUsed(turn)
  const rows = 1 + brief.claims.length
  // The stamp lands as the last claim settles; the crew follows it.
  const stampAt = Math.min(rows - 1, STAGGER_CAP) * STAGGER_MS + RISE_MS - 60
  const crewAt = stampAt + 280

  return (
    <div className="brief">
      <div className="brief-main">
        <p className={cn('brief-lede', live && 'brief-rise')} style={live ? rise(0) : undefined}>
          <Inline text={brief.lede} known={known} onCite={onCite} trace={turn.id} />
        </p>
        {brief.claims.length > 0 && (
          <ol className="brief-claims">
            {brief.claims.map((claim, i) => (
              <li key={i} className={cn('brief-claim', live && 'brief-rise')} style={live ? rise(i + 1) : undefined}>
                <span aria-hidden className="brief-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <Inline text={claim} known={known} onCite={onCite} trace={turn.id} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {brief.recorded > 0 && (
        <aside className="brief-rail" aria-label="Sources this answer cites">
          {/* Both counts from the record: the items the run recorded, and
              how many of the ids the answer cites resolve to them. */}
          <p className="brief-label">
            Sources · {brief.cited.length} of {brief.recorded} cited
          </p>
          {brief.cited.map((item) => (
            <CiteButton key={item.id} id={item.id} onCite={onCite} trace={turn.id} className="brief-source">
              <span className={cn(CITE_CHIP, 'h-[18px] px-1')}>{item.id}</span>
              <span className="brief-source-name">{citeLabel(item)}</span>
              {typeof item.score === 'number' && <small className="brief-source-meta">score {item.score.toFixed(2)}</small>}
            </CiteButton>
          ))}
        </aside>
      )}

      <div className="brief-signoff">
        {stamp && (
          <span className="brief-stamp-tilt">
            <span className={cn('brief-stamp', STAMP_TONE[stamp.tone], live && 'hv-lock')} style={live ? delay(stampAt) : undefined}>
              {stamp.label}
            </span>
          </span>
        )}
        {crew.length > 0 && (
          <ul className="brief-crew" aria-label="Crew on this run">
            {crew.map((mark, i) => (
              <li
                key={mark.member.id}
                title={`${mark.member.callsign} · ${mark.basis}`}
                className={cn('brief-crew-chip', mark.state === 'skipped' && 'is-skipped', live && 'hv-tick')}
                style={live ? delay(crewAt + i * STAGGER_MS) : undefined}
              >
                {mark.member.callsign}
                <span className="sr-only">{mark.state === 'lit' ? ' worked on this run' : ' did not run'}</span>
              </li>
            ))}
          </ul>
        )}
        {(turn.elapsedMs !== null || models.length > 0) && (
          <span className="brief-label brief-meta">
            {[turn.elapsedMs !== null ? `${(turn.elapsedMs / 1000).toFixed(1)} s` : null, models.join(' + ') || null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
    </div>
  )
}
