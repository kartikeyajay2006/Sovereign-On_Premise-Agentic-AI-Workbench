'use client'

import { SOVEREIGN_NODES } from '@/lib/mock-data'

/**
 * Local-system topology: a central host node with six surrounding subsystems.
 * Connections animate as slow signal dashes travelling inward — everything
 * stays within the host boundary (the dashed ring). SVG-based, GPU-cheap.
 */
export function SovereigntyTopology({ dark = false }: { dark?: boolean }) {
  const cx = 200
  const cy = 200
  const r = 140
  const stroke = dark ? '#2a2a28' : '#dcdad6'
  const strokeStrong = dark ? '#3a3a37' : '#c8c5bf'
  const text = dark ? '#9a978f' : '#8a8783'
  const textStrong = dark ? '#f5f5f2' : '#0a0a0a'
  const surface = dark ? '#121211' : '#ffffff'

  const nodes = SOVEREIGN_NODES.map((n, i) => {
    const angle = (i / SOVEREIGN_NODES.length) * Math.PI * 2 - Math.PI / 2
    return { ...n, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
  })

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="Local system topology">
      {/* host boundary */}
      <circle cx={cx} cy={cy} r={r + 34} fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="2 6" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth="1" />

      {/* connections */}
      {nodes.map((n) => (
        <g key={`line-${n.id}`}>
          <line x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={stroke} strokeWidth="1" />
          <line
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            stroke={dark ? '#16a34a' : '#16a34a'}
            strokeWidth="1"
            strokeDasharray="3 22"
            strokeOpacity="0.55"
            style={{ animation: 'sov-dash 6s linear infinite' }}
          />
        </g>
      ))}

      {/* surrounding nodes */}
      {nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x - 5} y={n.y - 5} width="10" height="10" fill={surface} stroke={strokeStrong} strokeWidth="1" />
          <text
            x={n.x}
            y={n.y > cy ? n.y + 22 : n.y - 14}
            textAnchor="middle"
            fontSize="8"
            letterSpacing="1.2"
            fontFamily="var(--font-mono)"
            fill={text}
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* central host */}
      <circle cx={cx} cy={cy} r="26" fill={surface} stroke={strokeStrong} strokeWidth="1" />
      <circle cx={cx} cy={cy} r="26" fill="none" stroke="#16a34a" strokeWidth="1" strokeOpacity="0.5" className="sov-pulse" />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={textStrong} fontWeight="500">
        HOST
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill={text}>
        127.0.0.1
      </text>
    </svg>
  )
}
