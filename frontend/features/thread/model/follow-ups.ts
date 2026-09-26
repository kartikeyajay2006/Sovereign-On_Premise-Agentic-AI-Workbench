import type { AssistantTurn } from './types'

/**
 * What the reader might ask next, built only from this run's record.
 *
 * Not suggestions from a model and not a canned list: each one exists
 * because the record says there is something left open -- a conflict no one
 * has resolved, a decision computed but not yet written up, a claim the
 * verifier found no support for. A chip fills the composer and never sends;
 * the person reads, edits and presses Run.
 */
export interface FollowUp {
  key: string
  /** The chip's words. */
  label: string
  /** What it puts in the composer. */
  prompt: string
  /** A deliverable format to select with it, or null to leave the choice alone. */
  format: string | null
}

const MAX = 3

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

export function followUps(turn: AssistantTurn): FollowUp[] {
  if (turn.outcome === 'running' || !turn.request) return []
  const out: FollowUp[] = []

  for (const conflict of turn.conflicts.filter((c) => c.status === 'unresolved')) {
    out.push({
      key: `conflict:${conflict.id}`,
      label: `Resolve: ${clip(conflict.label, 40)}`,
      prompt: `The sources disagree about ${conflict.label}. Set out each source's value and exactly where it is stated, so a reviewer can resolve it.`,
      format: null,
    })
  }

  // A decision the registry computed, answered in prose only: the note an
  // approver signs has not been drafted yet.
  if (turn.assessment && turn.request.format === null) {
    out.push({
      key: 'approval-note',
      label: 'Draft the approval note as DOCX',
      prompt: `Prepare the approval note for ${turn.assessment.subject} as a Word document from the same evidence: ${turn.request.prompt}`,
      format: 'docx',
    })
  }

  for (const claim of turn.claims.filter((c) => c.verdict === 'UNSUPPORTED')) {
    out.push({
      key: `claim:${claim.id}`,
      label: `Ask again about: ${clip(claim.text, 48)}`,
      prompt: `Is this supported by our procedures and records? "${claim.text}" Cite the clause it rests on, or say plainly that nothing supports it.`,
      format: null,
    })
  }

  return out.slice(0, MAX)
}
