'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface ChapterTab {
  key: string
  n: string
  label: string
  line: string
  /** One reading from the run for this step, or null when the record has none. */
  stat: string | null
}

const COLUMNS = Array.from({ length: 12 }, (_, i) => i)

/**
 * Numbered square tabs, 01 RETRIEVE / 02 VERIFY / 03 SEAL, that drive one
 * product view.
 *
 * A pointer choice changes the view under a chapter wipe: twelve column
 * shutters, one per grid column, open across it (480ms, 24ms apart). A key
 * choice changes it at once, because anything a key does answers within
 * 150ms. With JavaScript off every panel is shown, one after another, and
 * the tabs read as a list of headings (landing.css keys that on html[data-js]).
 */
export function ChapterTiles({ tabs, panels, idBase }: { tabs: ChapterTab[]; panels: ReactNode[]; idBase: string }) {
  const [index, setIndex] = useState(0)
  const [wipe, setWipe] = useState(0)
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const choose = (i: number, animate: boolean) => {
    if (i === index) return
    setIndex(i)
    if (animate) setWipe((n) => n + 1)
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let next: number | null = null
    if (event.key in keys) next = (index + keys[event.key] + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    if (next === null) return
    event.preventDefault()
    choose(next, false)
    refs.current[next]?.focus()
  }

  return (
    <div className="lp-chapters">
      <div role="tablist" aria-label="Steps of the recorded run" aria-orientation="horizontal" className="tiles" onKeyDown={onKey}>
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            ref={(node) => {
              refs.current[i] = node
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.key}`}
            aria-selected={i === index}
            aria-controls={`${idBase}-panel-${tab.key}`}
            tabIndex={i === index ? 0 : -1}
            className="tile"
            onClick={() => choose(i, true)}
          >
            <span className="n">{tab.n}</span>
            <span className="t">{tab.label}</span>
            {tab.stat ? <span className="s">{tab.stat}</span> : null}
            <span className="l">{tab.line}</span>
          </button>
        ))}
      </div>

      <div className="view">
        {panels.map((panel, i) => (
          <div
            key={tabs[i].key}
            id={`${idBase}-panel-${tabs[i].key}`}
            role="tabpanel"
            aria-labelledby={`${idBase}-tab-${tabs[i].key}`}
            data-on={i === index ? '' : undefined}
            className="panel"
          >
            {panel}
          </div>
        ))}
        {wipe > 0 ? (
          <div key={wipe} className="lp-wipe" aria-hidden>
            {COLUMNS.map((c) => (
              <i key={c} style={{ ['--c' as string]: c }} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
