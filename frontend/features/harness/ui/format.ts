/**
 * Formatting for harness screens. Every function returns an em dash for a
 * value that is absent: unknown is not zero, and an empty cell must not read
 * as "0 s".
 */

export const ABSENT = '—'

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return ABSENT
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return ABSENT
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ABSENT
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ABSENT
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ABSENT
  return at.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ABSENT
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} kB`
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : ABSENT
}

/** "SOP-INS-014" from "SOP-INS-014 — Pressure Vessel ...", as the server does. */
export function documentCode(title: string): string {
  for (const separator of [' — ', ' – ', ' - ']) {
    const at = title.indexOf(separator)
    if (at > 0) return title.slice(0, at).trim()
  }
  return title.length <= 40 ? title : `${title.slice(0, 39).trimEnd()}…`
}

/** "2. Inspection Intervals" from "section: 2. Inspection Intervals, part 1". */
export function sectionName(location: string | null | undefined): string {
  let text = (location || '').trim().replace(/,\s*part\s+\d+\s*$/i, '')
  if (text.toLowerCase().startsWith('section: ')) text = text.slice('section: '.length)
  return text.trim()
}

export function plural(count: number, word: string, many: string = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`
}
