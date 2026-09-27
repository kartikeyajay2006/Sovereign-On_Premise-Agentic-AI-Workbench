/**
 * A run's time as a person would say it: 0.8 s, 6.4 s, 48 s, 3 min 36 s.
 * Tenths only while they still matter (under ten seconds).
 */
export function spokenDuration(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`
}
