import { memo } from 'react'
import { Paperclip } from 'lucide-react'
import type { UserTurn as UserTurnModel } from '../model/types'
import { ClassificationTag } from '@/components/primitives'

/**
 * What the operator asked for: a quiet bubble on the right, the way every
 * chat product sets the person's side of the conversation, so the answer
 * owns the reading column. Who asked and when is kept, one line under it,
 * and brightens under the pointer.
 *
 * Memoised: a question does not change while its answer streams, and the
 * thread renders twenty times a second while it does.
 */
export const UserTurn = memo(function UserTurn({ turn }: { turn: UserTurnModel }) {
  return (
    <article className="group flex flex-col items-end">
      <div className="max-w-[85%] rounded-[var(--radius-sm-token)] border border-line-subtle bg-surface-sunken px-4 py-3">
        {turn.skill && (
          <p className="mb-1 flex items-baseline gap-2 text-[12.5px]" title="This request went through a saved skill. The run met every check a typed request does.">
            <span className="font-mono text-foreground">/{turn.skill.id}</span>
            <span className="text-foreground-muted">{turn.skill.name}</span>
          </p>
        )}
        <p className="whitespace-pre-wrap text-[15.5px] leading-[1.6] text-foreground">{turn.text}</p>

        {turn.attachments.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {turn.attachments.map((a) => (
              <li
                key={a.fileId}
                className="flex max-w-full items-center gap-2 rounded-[var(--radius-xs)] bg-surface py-1 pl-2.5 pr-2 text-[12px] text-foreground-secondary"
              >
                <Paperclip className="size-3 shrink-0 text-foreground-muted" aria-hidden />
                <span className="max-w-[200px] truncate">{a.filename}</span>
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
      </div>

      {/* Full muted ink, not faded further: at 70% opacity this line fell
          under AA for its size. */}
      <p className="mt-1.5 px-1 font-mono text-[10.5px] uppercase tracking-[var(--ls-ledger)] text-foreground-muted transition-colors duration-150 group-hover:text-foreground-secondary">
        {turn.author.displayName} ·{' '}
        <time dateTime={turn.at} title={turn.at}>
          {new Date(turn.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
      </p>
    </article>
  )
})
