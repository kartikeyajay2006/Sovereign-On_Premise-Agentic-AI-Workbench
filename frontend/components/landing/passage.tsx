import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Marquee } from './marquee'

/**
 * Which words of a passage to box. Either the first occurrence of a phrase in
 * running text, or one table cell named by its row (the first column's value)
 * and its column heading. A cell is named rather than matched by text because
 * the text is not unique: "Head of Inspection" is in two rows of the findings
 * table, and which row it sits in is the entire point.
 *
 * A mark that matches nothing draws nothing. Nothing here falls back to boxing
 * something nearby.
 */
export type PassageMark =
  | { kind: 'text'; text: string }
  | { kind: 'cell'; row: string; column: string }

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

/**
 * The stored chunk, split into the few block forms the corpus actually uses.
 *
 * The SOP files are hard-wrapped at about 76 columns, so a paragraph's lines
 * are joined with a space: that is what the line breaks mean in markdown, and
 * rendering them as breaks would set a ragged column that is not in the
 * document. Anything this does not recognise is rendered as a paragraph of
 * its own text, never dropped.
 */
function toBlocks(excerpt: string): Block[] {
  return excerpt
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block): Block => {
      const lines = block.split('\n')
      if (lines.length === 1 && /^#{1,6}\s/.test(lines[0])) {
        return { kind: 'heading', text: lines[0].replace(/^#{1,6}\s+/, '') }
      }
      if (
        lines.length >= 2 &&
        lines.every((line) => line.trim().startsWith('|')) &&
        /^\|?\s*:?-{3,}/.test(lines[1].trim())
      ) {
        return { kind: 'table', header: cells(lines[0]), rows: lines.slice(2).map(cells) }
      }
      if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
        return { kind: 'list', ordered: false, items: lines.map((l) => l.replace(/^\s*[-*]\s+/, '')) }
      }
      if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
        return { kind: 'list', ordered: true, items: lines.map((l) => l.replace(/^\s*\d+\.\s+/, '')) }
      }
      return { kind: 'paragraph', text: lines.map((line) => line.trim()).join(' ') }
    })
}

/**
 * **bold** and nothing else, because nothing else occurs in the corpus. Every
 * branch returns a text node inside an element chosen here, so a stored chunk
 * carrying markup cannot inject any.
 *
 * `mark.placed` is shared by every Inline in one passage: the first one to
 * find the phrase boxes it and sets the flag, so a phrase that recurs is boxed
 * once.
 */
function Inline({
  text,
  mark,
}: {
  text: string
  mark: { phrase: string; placed: { value: boolean } } | null
}) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g).filter((part) => part.length > 0)
  return (
    <>
      {parts.map((part, i) => {
        const bold = /^\*\*[^*\n]+\*\*$/.test(part)
        const content = bold ? part.slice(2, -2) : part
        const at = mark && !mark.placed.value ? content.indexOf(mark.phrase) : -1
        const wrap = (node: ReactNode) =>
          bold ? (
            <strong key={i} className="font-medium text-foreground">
              {node}
            </strong>
          ) : (
            <Fragment key={i}>{node}</Fragment>
          )
        if (at === -1 || !mark) return wrap(content)
        mark.placed.value = true
        return wrap(
          <>
            {content.slice(0, at)}
            <Marquee>{mark.phrase}</Marquee>
            {content.slice(at + mark.phrase.length)}
          </>,
        )
      })}
    </>
  )
}

function Table({ header, rows, mark }: { header: string[]; rows: string[][]; mark: PassageMark | null }) {
  const column = mark?.kind === 'cell' ? header.indexOf(mark.column) : -1
  const isMarked = (row: string[], index: number) =>
    mark?.kind === 'cell' && index === column && column > 0 && row[0] === mark.row

  return (
    <>
      {/*
        A real table where the pane is wide enough to hold four columns, and
        one block per row where it is not. The switch is on the pane's own
        width, not the viewport's: at 1440px the pane is under 500px wide, and
        a viewport breakpoint would set a four-column table in it anyway.
        Both are display-toggled, so a screen reader meets exactly one.
      */}
      {/*
        Headings in the document's own words and case. Uppercase mono is this
        page's register for machine values, and a column heading written by
        the author of an SOP is not one.
      */}
      <table className="hidden w-full border-collapse text-left text-ui leading-[18px] @md:table">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={cell}
                scope="col"
                className={cn(
                  'border-b border-line-default pb-2 align-bottom font-medium text-foreground-secondary',
                  i === 0 ? 'pr-3' : 'px-2',
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-b border-line-subtle last:border-b-0">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="py-2.5 pr-3 align-top font-medium text-foreground">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="px-2 py-2.5 align-top text-foreground-secondary">
                    {isMarked(row, i) ? <Marquee>{cell}</Marquee> : cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="@md:hidden">
        {rows.map((row) => (
          <div key={row[0]} className="border-t border-line-subtle py-3 first:border-t-0 first:pt-0">
            <p className="text-body font-medium text-foreground">{row[0]}</p>
            <dl className="m-0 mt-2 grid grid-cols-1 gap-2">
              {row.slice(1).map((cell, j) => (
                <div key={header[j + 1] ?? j}>
                  <dt className="text-ui font-medium text-foreground-secondary">{header[j + 1]}</dt>
                  <dd className="m-0 mt-0.5 text-ui leading-[18px] text-foreground-secondary">
                    {isMarked(row, j + 1) ? <Marquee>{cell}</Marquee> : cell}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  )
}

export interface PassageProps {
  excerpt: string
  mark?: PassageMark | null
  className?: string
}

/**
 * A retrieved chunk, rendered.
 *
 * The rendering is a convenience and the stored text is the record: the
 * inspector offers the raw excerpt beside this view, so a reader can confirm
 * that nothing was added, reworded or dropped on the way to the screen.
 */
export function Passage({ excerpt, mark = null, className }: PassageProps) {
  const textMark =
    mark?.kind === 'text' ? { phrase: mark.text, placed: { value: false } } : null

  return (
    <div className={cn('@container flex flex-col gap-3 text-body leading-[22px] text-foreground', className)}>
      {toBlocks(excerpt).map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <p key={i} className="text-heading font-medium text-foreground">
              {block.text}
            </p>
          )
        }
        if (block.kind === 'table') {
          return <Table key={i} header={block.header} rows={block.rows} mark={mark} />
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul'
          return (
            <List
              key={i}
              className={cn('m-0 flex flex-col gap-1 pl-5', block.ordered ? 'list-decimal' : 'list-disc')}
            >
              {block.items.map((item) => (
                <li key={item} className="pl-1 marker:text-foreground-muted">
                  <Inline text={item} mark={textMark} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <p key={i} className="m-0">
            <Inline text={block.text} mark={textMark} />
          </p>
        )
      })}
    </div>
  )
}
