import { Paperclip } from 'lucide-react'
import type { UserTurn as UserTurnModel } from '../model/types'
import { ClassificationTag } from '@/components/primitives'

/**
 * What the operator asked for.
 *
 * No bubble, no avatar, no right alignment. Both turns are left-aligned in
 * one column; the user turn is distinguished by a sunken tint and a 2px left
 * rule rather than by a frame. Grouping by tint and rule instead of by box is
 * the same card-less rule the rest of the interface follows, and a chat
 * bubble would waste the right third of the column that the stage board and
 * the evidence rows need.
 */
export function UserTurn({ turn }: { turn: UserTurnModel }) {
  return (
    <article className="border-l-2 border-line-strong bg-surface-sunken px-4 py-3">
      <p className="whitespace-pre-wrap text-answer leading-[var(--lh-answer)] text-foreground">
        {turn.text}
      </p>

      {turn.attachments.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {turn.attachments.map((a) => (
            <li
              key={a.fileId}
              className="flex items-center gap-2 font-mono text-meta text-foreground-secondary"
            >
              <Paperclip className="h-3 w-3 shrink-0 text-foreground-muted" aria-hidden />
              <span className="truncate-cell">{a.filename}</span>
              <span className="tabular shrink-0 text-foreground-muted">
                {a.sizeBytes < 1024
                  ? `${a.sizeBytes} B`
                  : a.sizeBytes < 1024 * 1024
                    ? `${Math.round(a.sizeBytes / 1024)} kB`
                    : `${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB`}
              </span>
              {/* The classification the backend assigned, not one the
                  composer decided to print. */}
              <ClassificationTag level={a.classification} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 text-right font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
        {turn.author.displayName} ·{' '}
        <time dateTime={turn.at} title={turn.at}>
          {new Date(turn.at).toLocaleTimeString()}
        </time>
      </div>
    </article>
  )
}
