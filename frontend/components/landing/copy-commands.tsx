'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The setup commands as a terminal: one prompt per line, and one button that
 * copies them all, without the prompts, ready to paste.
 */
export function CopyCommands({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // The clipboard API is unavailable over plain HTTP in some browsers;
      // the text stays selectable in the <pre>.
    }
  }

  return (
    <div className="lp-term">
      <div className="bar">
        <i aria-hidden />
        <i aria-hidden />
        <i aria-hidden />
        <span>Terminal</span>
        <button type="button" onClick={copy} className="copy" aria-label={copied ? 'Commands copied' : 'Copy the commands'}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        {lines.map((line, i) => (
          <div key={`${i}-${line}`}>
            <span className="p" aria-hidden>
              ${' '}
            </span>
            {line}
          </div>
        ))}
      </pre>
    </div>
  )
}
