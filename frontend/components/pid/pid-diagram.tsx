'use client'

import { useMemo } from 'react'
import type { Highlight, PidDrawing, PidNode } from './api'

/**
 * A P&ID drawn from its graph, so what is highlighted is exactly what the
 * graph's answer named: valves to close and lock in red, bleeds to open in
 * amber, blinds to turn filled red, lines that cannot be isolated as drawn
 * dashed red, equipment cut off by the isolation outlined amber. Instruments
 * are bubbles, tied to what they measure by a dashed signal line.
 */

const INK = 'var(--foreground)'
const MUTED = 'var(--foreground-muted)'
const RED = 'var(--critical)'
const AMBER = 'var(--approval)'
const GREEN = 'var(--sovereign)'

function Glyph({ node, stroke, fill }: { node: PidNode; stroke: string; fill: string }) {
  const { x, y } = node
  switch (node.type) {
    case 'column':
      return <rect x={x - 16} y={y - 70} width={32} height={140} rx={16} fill={fill} stroke={stroke} strokeWidth={1.6} />
    case 'drum':
      return <rect x={x - 44} y={y - 18} width={88} height={36} rx={18} fill={fill} stroke={stroke} strokeWidth={1.6} />
    case 'exchanger':
      return (
        <g>
          <circle cx={x} cy={y} r={16} fill={fill} stroke={stroke} strokeWidth={1.6} />
          <path d={`M ${x - 11} ${y + 6} L ${x - 4} ${y - 6} L ${x + 4} ${y + 6} L ${x + 11} ${y - 6}`} fill="none" stroke={stroke} strokeWidth={1.2} />
        </g>
      )
    case 'pump':
      return (
        <g>
          <circle cx={x} cy={y} r={13} fill={fill} stroke={stroke} strokeWidth={1.6} />
          <path d={`M ${x - 7} ${y - 7} L ${x + 9} ${y} L ${x - 7} ${y + 7} Z`} fill="none" stroke={stroke} strokeWidth={1.2} />
        </g>
      )
    case 'gate_valve':
    case 'check_valve':
    case 'control_valve':
    case 'psv':
      return (
        <g>
          <path d={`M ${x - 8} ${y - 6} L ${x + 8} ${y + 6} L ${x + 8} ${y - 6} L ${x - 8} ${y + 6} Z`} fill={fill} stroke={stroke} strokeWidth={1.4} />
          {node.type === 'control_valve' && (
            <path d={`M ${x} ${y} L ${x} ${y - 12} M ${x - 6} ${y - 12} A 6 6 0 0 1 ${x + 6} ${y - 12}`} fill="none" stroke={stroke} strokeWidth={1.2} />
          )}
          {node.type === 'check_valve' && <path d={`M ${x + 8} ${y - 9} L ${x + 8} ${y + 9}`} stroke={stroke} strokeWidth={1.4} />}
          {node.type === 'psv' && <path d={`M ${x} ${y} L ${x} ${y - 14} L ${x - 4} ${y - 17} L ${x + 4} ${y - 20} L ${x} ${y - 23}`} fill="none" stroke={stroke} strokeWidth={1.2} />}
          {node.car_sealed && <text x={x + 10} y={y - 8} fontSize={7} fill={MUTED}>CSO</text>}
        </g>
      )
    case 'spectacle_blind':
      return (
        <g>
          <circle cx={x - 5} cy={y} r={5} fill="none" stroke={stroke} strokeWidth={1.4} />
          <circle cx={x + 5} cy={y} r={5} fill={fill === 'transparent' ? 'var(--surface)' : fill} stroke={stroke} strokeWidth={1.4} />
        </g>
      )
    case 'bleed':
      return (
        <g>
          <circle cx={x} cy={y} r={4} fill={fill} stroke={stroke} strokeWidth={1.4} />
          <path d={`M ${x} ${y + 4} L ${x} ${y + 12} M ${x - 4} ${y + 12} L ${x + 4} ${y + 12}`} stroke={stroke} strokeWidth={1.2} />
        </g>
      )
    case 'tee':
      return <circle cx={x} cy={y} r={3} fill={stroke} />
    case 'boundary':
      return <path d={`M ${x - 22} ${y - 10} L ${x + 10} ${y - 10} L ${x + 22} ${y} L ${x + 10} ${y + 10} L ${x - 22} ${y + 10} Z`} fill={fill} stroke={stroke} strokeWidth={1.4} />
    case 'instrument':
      return <circle cx={x} cy={y} r={11} fill="var(--surface)" stroke={stroke} strokeWidth={1.2} />
    default:
      return <circle cx={x} cy={y} r={5} fill={fill} stroke={stroke} />
  }
}

export function PidDiagram({
  drawing,
  highlight,
  onSelect,
  selected,
}: {
  drawing: PidDrawing
  highlight: Highlight
  onSelect?: (tag: string) => void
  selected?: string | null
}) {
  const byId = useMemo(() => new Map(drawing.nodes.map((n) => [n.id, n])), [drawing])
  const failedEdge = (line: string) => highlight.failedLines.has(line)

  return (
    <svg
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      role="img"
      aria-label={`${drawing.id} rev ${drawing.revision}: ${drawing.title}`}
      className="h-auto w-full rounded-[var(--radius)] bg-surface"
    >
      <defs>
        <marker id="pid-flow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={MUTED} />
        </marker>
      </defs>
      {drawing.edges.map((edge, index) => {
        const a = byId.get(edge.from)!
        const b = byId.get(edge.to)!
        const onRoute = highlight.route.has(`${edge.from}>${edge.to}`) || highlight.route.has(`${edge.to}>${edge.from}`)
        const stroke = failedEdge(edge.line) ? RED : onRoute ? GREEN : edge.service === 'water' ? MUTED : INK
        return (
          <g key={index}>
            <polyline
              points={`${a.x},${a.y} ${(a.x + b.x) / 2},${(a.y + b.y) / 2} ${b.x},${b.y}`}
              fill="none"
              stroke={stroke}
              strokeWidth={onRoute || failedEdge(edge.line) ? 2.4 : 1.2}
              strokeDasharray={failedEdge(edge.line) ? '6 4' : undefined}
              markerMid="url(#pid-flow)"
              opacity={0.85}
            />
          </g>
        )
      })}
      {drawing.nodes
        .filter((n) => n.type === 'instrument' && n.measures && byId.get(n.measures))
        .map((n) => {
          const target = byId.get(n.measures!)!
          return <line key={`sig-${n.id}`} x1={n.x} y1={n.y} x2={target.x} y2={target.y} stroke={MUTED} strokeWidth={0.8} strokeDasharray="2 3" />
        })}
      {drawing.nodes.map((node) => {
        const isTarget = highlight.target === node.id
        const closed = highlight.close.has(node.id)
        const bled = highlight.bleeds.has(node.id)
        const blind = highlight.blinds.has(node.id)
        const affected = highlight.affected.has(node.id)
        const reached = highlight.reached.has(node.id)
        const stroke = isTarget ? INK : closed || blind ? RED : bled ? AMBER : affected ? AMBER : reached ? GREEN : INK
        const fill = closed || blind ? RED : bled ? AMBER : isTarget ? 'color-mix(in oklab, var(--foreground) 10%, transparent)' : 'transparent'
        const big = ['column', 'drum', 'exchanger', 'pump', 'boundary'].includes(node.type)
        return (
          <g
            key={node.id}
            onClick={onSelect ? () => onSelect(node.id) : undefined}
            className={onSelect ? 'cursor-pointer' : undefined}
            aria-label={`${node.id} ${node.label}`}
          >
            {selected === node.id && <circle cx={node.x} cy={node.y} r={big ? 34 : 16} fill="none" stroke={INK} strokeDasharray="3 3" />}
            <Glyph node={node} stroke={stroke} fill={fill} />
            {node.type !== 'tee' && (
              <text
                x={node.x}
                y={node.type === 'instrument' ? node.y + 3 : node.y + (big ? (node.type === 'column' ? 84 : 30) : 20)}
                textAnchor="middle"
                fontSize={node.type === 'instrument' ? 6.5 : big ? 10 : 7.5}
                fontFamily="var(--font-mono, monospace)"
                fontWeight={isTarget || big ? 600 : 400}
                fill={closed || blind ? RED : INK}
              >
                {node.id}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function PidLegend() {
  const item = (color: string, label: string, dashed = false) => (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="8" aria-hidden>
        <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="2.4" strokeDasharray={dashed ? '5 3' : undefined} />
      </svg>
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-foreground-muted">
      {item(RED, 'close and lock / turn blind')}
      {item(AMBER, 'open bleed · cut off')}
      {item(RED, 'cannot be isolated as drawn', true)}
      {item(GREEN, 'path / reached')}
    </div>
  )
}
