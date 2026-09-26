'use client'

import { forwardRef, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Citation, HarnessRunView } from '../../model/types'
import { OUTCOME } from '../outcome'
import { documentCode, sectionName } from '../format'
import { BODY, LABEL, LABEL_STRONG, PANE, PANE_HEAD } from './style'

/**
 * Claims and the evidence they rest on, in four fixed columns:
 * document -> section -> claim -> child.
 *
 * Built only from each released child's record: its verifier's claims and
 * the evidence ids on each. No force layout and no inferred link: an edge
 * is drawn because a claim's evidence_ids names that passage, and a claim
 * whose id resolves to nothing says so beside the claim rather than
 * pointing at a guess. Nodes are one fixed size; a section shows its
 * retrieval score as a number (the highest reading when several children
 * retrieved it, and it says "max").
 *
 * LOCK: brackets land on a section every claim resting on which the
 * verifier supported; amber when only some of them were. TRACE: an edge
 * the graph did not have when it first drew -- a child settling while the
 * page is open -- draws once. Neither is ever started by a key.
 */

const COL_X = [4, 150, 316, 500]
const NODE_W = [136, 156, 172, 76]
const ROW_H = 24
const NODE_H = 18
const TOP = 22

const SUPPORTED = new Set(['SUPPORTED', 'CALCULATED'])
const VERDICT_SHORT: Record<string, string> = {
  SUPPORTED: 'SUP',
  CALCULATED: 'CALC',
  CONFLICTED: 'CONF',
  UNSUPPORTED: 'UNSUP',
  REQUIRES_HUMAN_DECISION: 'HUMAN',
}

interface Node {
  key: string
  col: number
  label: string
  sub: string | null
  title: string
  children: Set<number>
}

interface Edge {
  key: string
  from: string
  to: string
  children: Set<number>
}

interface Graph {
  columns: Node[][]
  edges: Edge[]
  locks: Map<string, 'full' | 'partial'>
  positions: Map<string, { col: number; row: number }>
}

function build(run: HarnessRunView): Graph {
  const docs = new Map<string, Node>()
  const sections = new Map<string, Node & { scores: number[] }>()
  const claims: Node[] = []
  const kids: Node[] = []
  const edges = new Map<string, Edge>()
  const sectionVerdicts = new Map<string, string[]>()

  const link = (from: string, to: string, child: number) => {
    const key = `${from}>${to}`
    const edge = edges.get(key) ?? { key, from, to, children: new Set<number>() }
    edge.children.add(child)
    edges.set(key, edge)
  }

  for (const child of run.children) {
    if (!child.released || child.claims.length === 0) continue
    const passages = new Map<string, Citation>()
    for (const c of [...child.citations, ...child.claim_evidence]) passages.set(c.id, c)
    const childKey = `child:${child.index}`
    kids.push({
      key: childKey,
      col: 3,
      label: `#${child.index}`,
      sub: OUTCOME[child.outcome].glyph || null,
      title: `#${child.index} · ${OUTCOME[child.outcome].label} · ${child.label}`,
      children: new Set([child.index]),
    })
    for (const claim of child.claims) {
      const claimKey = `claim:${child.index}:${claim.id}`
      const unresolved = claim.evidence_ids.filter((id) => !passages.has(id))
      claims.push({
        key: claimKey,
        col: 2,
        label: `#${child.index} ${claim.id} ${VERDICT_SHORT[claim.verdict] ?? claim.verdict}`,
        sub: unresolved.length ? `${unresolved.join(',')}?` : null,
        title: `${claim.verdict} · ${claim.text}${unresolved.length ? ` · not retrieved: ${unresolved.join(', ')}` : ''}`,
        children: new Set([child.index]),
      })
      link(claimKey, childKey, child.index)
      for (const id of claim.evidence_ids) {
        const passage = passages.get(id)
        if (!passage) continue
        const doc = documentCode(passage.source_document)
        const docKey = `doc:${doc}`
        const section = sectionName(passage.location) || passage.id
        const sectionKey = `section:${doc}|${section}`
        const docNode = docs.get(docKey) ?? { key: docKey, col: 0, label: doc, sub: null, title: passage.source_document, children: new Set<number>() }
        docNode.children.add(child.index)
        docs.set(docKey, docNode)
        const sectionNode =
          sections.get(sectionKey) ??
          { key: sectionKey, col: 1, label: section, sub: null, title: `${doc} · ${section}`, children: new Set<number>(), scores: [] }
        sectionNode.children.add(child.index)
        if (passage.score !== null) sectionNode.scores.push(passage.score)
        sections.set(sectionKey, sectionNode)
        sectionVerdicts.set(sectionKey, [...(sectionVerdicts.get(sectionKey) ?? []), claim.verdict])
        link(docKey, sectionKey, child.index)
        link(sectionKey, claimKey, child.index)
      }
    }
  }

  for (const node of sections.values()) {
    if (node.scores.length === 0) node.sub = 'score —'
    else if (node.scores.length === 1) node.sub = `score ${node.scores[0].toFixed(3)}`
    else node.sub = `max ${Math.max(...node.scores).toFixed(3)}`
  }

  const locks = new Map<string, 'full' | 'partial'>()
  for (const [key, verdicts] of sectionVerdicts) {
    const supported = verdicts.filter((v) => SUPPORTED.has(v)).length
    if (supported === 0) continue
    locks.set(key, supported === verdicts.length ? 'full' : 'partial')
  }

  const columns = [[...docs.values()], [...sections.values()], claims, kids]
  const positions = new Map<string, { col: number; row: number }>()
  columns.forEach((nodes, col) => nodes.forEach((node, row) => positions.set(node.key, { col, row })))
  return { columns, edges: [...edges.values()], locks, positions }
}

function anchor(positions: Graph['positions'], key: string, side: 'in' | 'out') {
  const p = positions.get(key)!
  const x = side === 'out' ? COL_X[p.col] + NODE_W[p.col] : COL_X[p.col]
  return { x, y: TOP + p.row * ROW_H + NODE_H / 2 }
}

export const EvidenceGraph = forwardRef<HTMLDivElement, { run: HarnessRunView; selected: number | null }>(
  function EvidenceGraph({ run, selected }, ref) {
    const graph = build(run)
    // Edges and locks present on first draw are shown drawn. Only one that
    // appears later -- a child settling while the page is open -- traces.
    const seen = useRef<{ edges: Set<string>; locks: Set<string> } | null>(null)
    if (seen.current === null) {
      seen.current = {
        edges: new Set(graph.edges.map((e) => e.key)),
        locks: new Set([...graph.locks].map(([k, tone]) => `${k}|${tone}`)),
      }
    }
    const rows = Math.max(1, ...graph.columns.map((c) => c.length))
    const height = TOP + rows * ROW_H + 4
    const hasSelection = selected !== null && graph.columns[3].some((n) => n.children.has(selected))
    const dim = (children: Set<number>) => hasSelection && !children.has(selected!)

    return (
      <section aria-label="Evidence graph" className={cn(PANE, 'min-h-[260px]')}>
        <header className={PANE_HEAD}>
          <h2 className={LABEL_STRONG}>Evidence graph</h2>
          <span className={LABEL}>g to focus</span>
        </header>
        <div
          ref={ref}
          tabIndex={0}
          aria-label="Claims and the evidence they rest on"
          className="max-h-[420px] min-h-0 flex-1 overflow-auto focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-foreground"
        >
          {graph.columns[2].length === 0 ? (
            <p className={cn(BODY, 'px-3 py-4 text-foreground-secondary')}>
              No released child has verified claims yet. The graph is drawn from each released child&rsquo;s claims and the
              passages their evidence ids name; a held child&rsquo;s claims are not shown here.
            </p>
          ) : (
            <svg
              role="img"
              aria-label={`${graph.columns[2].length} claims resting on ${graph.columns[1].length} sections of ${graph.columns[0].length} documents`}
              viewBox={`0 0 ${COL_X[3] + NODE_W[3] + 4} ${height}`}
              className="block w-full min-w-[560px]"
              style={{ height }}
            >
              {['document', 'section', 'claim', 'child'].map((name, col) => (
                <text key={name} x={COL_X[col]} y={12} className="fill-foreground-muted font-mono text-[9px] uppercase tracking-[0.1em]">
                  {name}
                </text>
              ))}
              {graph.edges.map((edge) => {
                const a = anchor(graph.positions, edge.from, 'out')
                const b = anchor(graph.positions, edge.to, 'in')
                const mid = (a.x + b.x) / 2
                const fresh = !seen.current!.edges.has(edge.key)
                return (
                  <path
                    key={edge.key}
                    d={`M${a.x},${a.y} C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`}
                    pathLength={1}
                    fill="none"
                    strokeWidth={1}
                    className={cn('stroke-foreground-muted', fresh && 'hv-trace', dim(edge.children) && 'opacity-25')}
                  />
                )
              })}
              {graph.columns.map((nodes, col) =>
                nodes.map((node, row) => {
                  const x = COL_X[col]
                  const y = TOP + row * ROW_H
                  const w = NODE_W[col]
                  const lock = col === 1 ? graph.locks.get(node.key) : undefined
                  const lockFresh = lock ? !seen.current!.locks.has(`${node.key}|${lock}`) : false
                  const selectedChild = col === 3 && selected !== null && node.children.has(selected)
                  return (
                    <g key={node.key} className={cn(dim(node.children) && 'opacity-35')}>
                      <title>{node.title}</title>
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={NODE_H}
                        className={cn('fill-surface-sunken', selectedChild ? 'stroke-foreground' : 'stroke-line-strong')}
                        strokeWidth={1}
                      />
                      <text x={x + 4} y={y + 12} className="fill-foreground font-mono text-[9.5px]">
                        {clipText(node.label, col === 3 ? 6 : col === 1 ? 14 : 18)}
                      </text>
                      {node.sub && (
                        <text x={x + w - 4} y={y + 12} textAnchor="end" className="fill-foreground-muted font-mono text-[9px]">
                          {node.sub}
                        </text>
                      )}
                      {lock && <LockBrackets x={x} y={y} w={w} h={NODE_H} tone={lock} fresh={lockFresh} />}
                    </g>
                  )
                }),
              )}
            </svg>
          )}
        </div>
      </section>
    )
  },
)

function clipText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** 8px corner brackets, 3px outside the node. */
function LockBrackets({ x, y, w, h, tone, fresh }: { x: number; y: number; w: number; h: number; tone: 'full' | 'partial'; fresh: boolean }) {
  const o = 3
  const l = 8
  const x0 = x - o
  const y0 = y - o
  const x1 = x + w + o
  const y1 = y + h + o
  const d = [
    `M${x0},${y0 + l} V${y0} H${x0 + l}`,
    `M${x1 - l},${y0} H${x1} V${y0 + l}`,
    `M${x0},${y1 - l} V${y1} H${x0 + l}`,
    `M${x1 - l},${y1} H${x1} V${y1 - l}`,
  ].join(' ')
  return (
    <g
      className={cn('hv-lock-frame', fresh && 'hv-lock')}
      data-tone={tone === 'partial' ? 'partial' : undefined}
      aria-label={tone === 'full' ? 'every claim resting here is supported' : 'some claims resting here are supported'}
    >
      <path d={d} fill="none" strokeWidth={1} />
    </g>
  )
}
