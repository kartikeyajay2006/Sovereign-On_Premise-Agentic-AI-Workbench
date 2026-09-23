export interface Stat {
  label: string
  value: string
  suffix?: string
  sub: string
}

/**
 * Four numbers, each read from the run record by the page. This component
 * draws what it is handed and invents nothing, so a figure the record
 * cannot supply is dropped by the caller rather than drawn as a placeholder.
 */
export function StatsBand({ stats, label, className }: { stats: Stat[]; label: string; className?: string }) {
  if (stats.length === 0) return null
  return (
    <dl aria-label={label} className={`ae-stats m-0 ${className ?? ''}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="ae-stat">
          <dd className="v m-0">
            {stat.value}
            {stat.suffix ? <small>{stat.suffix}</small> : null}
          </dd>
          <dt className="l">{stat.label}</dt>
          <dd className="s m-0">{stat.sub}</dd>
        </div>
      ))}
    </dl>
  )
}
