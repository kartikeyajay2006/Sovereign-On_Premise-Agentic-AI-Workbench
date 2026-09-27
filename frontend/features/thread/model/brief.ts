import type { EvidenceItem } from '@/lib/types'
import { CREW, type CrewMember } from '@/lib/crew'
import type { AssistantTurn } from './types'

/**
 * The Brief: how a checked prose answer is set.
 *
 * Its first sentence is the lede, the rest are numbered claims, the sources
 * it cites stand in the margin, and a sign-off row says how it ended and who
 * worked on it. Everything here is read from the turn, which is read from
 * the task record: nothing is summarised, inferred or filled in.
 *
 * Kept free of React so the rules can be read, and checked, on their own.
 */

// ── Sentences, as the verifier reads them ────────────────────────────────
// backend/agents/verifier.py: SENTENCE_SPLIT and _TRAILING_CITATIONS. The
// lede is only honest if it is the sentence the verifier checked, so the
// split is the verifier's, citation handling included: a citation written
// after the full stop -- "... applies. [S5]" -- belongs to the sentence
// before it, and is moved inside the full stop before splitting.
const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/
const TRAILING_CITATIONS = /([.!?])((?:\s*\[[A-Z]{1,3}\d+(?:\.\d+)*\])+)/g

/** The text's sentences, each carrying the citations written after its full stop. */
export function answerSentences(text: string): string[] {
  return (text || '')
    .replace(TRAILING_CITATIONS, '$2$1')
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The small model sometimes opens an answer with the citation it then
 * repeats at the end of the sentence: "[S1] A vessel ... 48 months. [S1]".
 * The opening one is dropped from the display when the same id cites the
 * text after it, so nothing it supports goes uncited; the record keeps the
 * text as written.
 */
export function withoutOpeningCitation(text: string): string {
  const opening = text.match(/^\s*\[([SFVCEHTW]\d+)\]\s*/)
  return opening && text.slice(opening[0].length).includes(`[${opening[1]}]`) ? text.slice(opening[0].length) : text
}

const CITATION = /\[([A-Z]{1,3}\d+(?:\.\d+)*)\]/g
const STRUCTURE = /^\s*(?:#{1,6}\s|[-*•]\s|\d+[.)]\s|\|)/m

/** The ids the text cites, in the order it first cites them. */
export function citedIds(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(CITATION), (m) => m[1])))
}

export type AnswerShape =
  /** Lede, numbered claims, margin sources. */
  | { kind: 'brief'; lede: string; claims: string[]; cited: EvidenceItem[]; recorded: number }
  /**
   * Markdown with structure, or the answer to a document request: set as it
   * was written. A first paragraph that is one sentence is still its lede.
   */
  | { kind: 'structured'; lede: string | null; body: string }
  /** A conversational reply, or one sentence: plain. */
  | { kind: 'plain'; body: string }

/**
 * Which setting an answer gets.
 *
 * A Brief needs a delivered, held or rejected run's prose answer of at least
 * two sentences. A conversational reply stays plain; an answer with
 * headings, a list or a table, or one that produced a document, keeps the
 * markdown it was written in.
 */
export function answerShape(turn: Pick<AssistantTurn, 'answer' | 'outcome' | 'profile' | 'deliverable' | 'evidence'>): AnswerShape {
  const text = withoutOpeningCitation(turn.answer ?? '')
  const settled = turn.outcome === 'delivered' || turn.outcome === 'held' || turn.outcome === 'rejected'
  if (!settled || turn.profile?.taskType === 'conversation') return { kind: 'plain', body: text }

  if (STRUCTURE.test(text) || turn.deliverable !== null) {
    const [first, ...rest] = text.split(/\n{2,}/)
    const opener = first?.trim() ?? ''
    const single = opener && !opener.includes('\n') && !STRUCTURE.test(opener) && answerSentences(opener).length === 1
    return single && rest.length > 0
      ? { kind: 'structured', lede: opener, body: rest.join('\n\n') }
      : { kind: 'structured', lede: null, body: text }
  }

  const sentences = answerSentences(text)
  if (sentences.length < 2) return { kind: 'plain', body: text }
  const cited = citedIds(text)
    .map((id) => turn.evidence.find((e) => e.id === id))
    .filter((e): e is EvidenceItem => e !== undefined)
  return { kind: 'brief', lede: sentences[0], claims: sentences.slice(1), cited, recorded: turn.evidence.length }
}

// ── The stamp ─────────────────────────────────────────────────────────────

export type StampTone = 'ok' | 'held' | 'critical' | 'neutral'

/**
 * How the run ended, in the record's own terms, with the checks it passed
 * out of those it ran. The count is left off when no check was recorded,
 * never shown as 0/0.
 */
export function stampOf(turn: Pick<AssistantTurn, 'outcome' | 'verification' | 'approval'>): { label: string; tone: StampTone } | null {
  const total = turn.verification.length
  const passed = turn.verification.filter((c) => c.passed).length
  const count = total > 0 ? ` · ${passed}/${total}` : ''
  switch (turn.outcome) {
    case 'delivered':
      // Lime only for a clean sheet; a delivered run with a failed check
      // is stamped in ink, the count saying why.
      return { label: `Delivered${count}`, tone: total > 0 && passed === total ? 'ok' : 'neutral' }
    case 'held':
      return { label: `Held for review${count}`, tone: 'held' }
    case 'rejected':
      return {
        label: turn.approval?.decision === 'revision_requested' ? `Returned for revision${count}` : `Rejected at review${count}`,
        tone: 'critical',
      }
    default:
      return null
  }
}

// ── The crew signature ────────────────────────────────────────────────────

export interface CrewMark {
  member: CrewMember
  /** Lit: it worked on this run. Skipped: the record says it did not. */
  state: 'lit' | 'skipped'
  /** The record it was read from, for the chip's title. */
  basis: string
}

/**
 * Who worked on the run, read from what the run log reads.
 *
 * A pipeline member is lit when its stage is done and marked skipped when
 * the stage is; any other state leaves it out. WARDEN is lit when the record
 * holds policy events, and NOTARY is left out: the task record carries no
 * reference to its audit records, so the thread cannot say.
 */
export function crewSignature(turn: Pick<AssistantTurn, 'stages' | 'policyEvents'>): CrewMark[] {
  const marks: CrewMark[] = []
  for (const member of CREW) {
    if (member.stage) {
      const stage = turn.stages.find((s) => s.id === member.stage)
      if (stage?.status === 'done') marks.push({ member, state: 'lit', basis: `${stage.name} ran in this run` })
      else if (stage?.status === 'skipped') marks.push({ member, state: 'skipped', basis: `${stage.name} did not run` })
    } else if (member.id === 'warden' && turn.policyEvents !== null) {
      marks.push(
        turn.policyEvents > 0
          ? { member, state: 'lit', basis: `${turn.policyEvents} policy event${turn.policyEvents === 1 ? '' : 's'} recorded` }
          : { member, state: 'skipped', basis: 'No policy event recorded' },
      )
    }
  }
  return marks
}

/** The models the run's calls were served by, as recorded, in the order first used. */
export function modelsUsed(turn: Pick<AssistantTurn, 'usage'>): string[] {
  return Array.from(new Set(turn.usage.map((u) => u.display_name || u.model).filter(Boolean)))
}
