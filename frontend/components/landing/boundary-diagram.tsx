/**
 * The product in one picture: the machine's boundary, everything AEGIS does
 * inside it, and the one line that would leave it, cut.
 *
 * An architecture drawing, not a reading -- it states no measured figure, and
 * the live count of connections that left the host sits beside it in the
 * hero, taken by the visitor's browser. Light moves along the edges in the
 * order a run takes them: the question and the procedures into the local
 * model, out to the sandbox and the verifier, on to the reviewer and the
 * audit chain. The route toward a cloud API runs to the boundary and stops.
 *
 * SVG and SMIL only: no script, nothing to hydrate, and the pulses are a few
 * small circles, so it costs almost nothing to run. Under reduced motion the
 * pulses are hidden and the drawing stands still.
 */

interface Node {
  id: string
  x: number
  y: number
  title: string
  sub: string
  chip: string
}

const NODES: Node[] = [
  { id: 'ask', x: 44, y: 78, title: 'You ask', sub: 'a question or a /skill', chip: 'var(--ctp-mauve)' },
  { id: 'sops', x: 270, y: 78, title: 'Your procedures', sub: 'indexed on this host', chip: 'var(--ctp-blue)' },
  { id: 'model', x: 157, y: 180, title: 'Local model', sub: 'on this CPU, no key', chip: 'var(--ctp-pink)' },
  { id: 'sandbox', x: 44, y: 282, title: 'Sandbox', sub: 'code runs contained', chip: 'var(--ctp-peach)' },
  { id: 'verify', x: 270, y: 282, title: 'Verifier', sub: 'checks every claim', chip: 'var(--ctp-green)' },
  { id: 'review', x: 44, y: 400, title: 'Reviewer', sub: 'signs what is held', chip: 'var(--ctp-yellow)' },
  { id: 'audit', x: 270, y: 400, title: 'Audit chain', sub: 'every step, hashed', chip: 'var(--ctp-lavender)' },
]

/** Edges, in the order a run takes them, with when their light sets off. */
const EDGES: Array<{ d: string; begin: number; color: string }> = [
  { d: 'M220 107 H270', begin: 0, color: 'var(--ctp-mauve)' },
  { d: 'M132 136 C132 160, 190 158, 200 180', begin: 0.35, color: 'var(--ctp-mauve)' },
  { d: 'M358 136 C358 160, 300 158, 290 180', begin: 0.5, color: 'var(--ctp-blue)' },
  { d: 'M190 238 C190 262, 132 258, 132 282', begin: 1.05, color: 'var(--ctp-pink)' },
  { d: 'M300 238 C300 262, 358 258, 358 282', begin: 1.1, color: 'var(--ctp-pink)' },
  { d: 'M220 311 H270', begin: 1.6, color: 'var(--ctp-peach)' },
  { d: 'M358 340 V400', begin: 2.05, color: 'var(--ctp-green)' },
  { d: 'M270 330 C230 352, 160 368, 132 400', begin: 2.1, color: 'var(--ctp-green)' },
  { d: 'M220 429 H270', begin: 2.6, color: 'var(--ctp-yellow)' },
]

const CYCLE = 3.6
const OUTBOUND = 'M333 209 C398 209, 436 249, 468 249'

export function BoundaryDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 620 520"
      role="img"
      aria-label="How AEGIS runs: your question, your procedures, a local model, a sandbox, a verifier, a reviewer and the audit chain, all inside your own hardware. The route toward a cloud API stops at the boundary."
      className={className}
    >
      {/* The machine. */}
      <rect x="20" y="44" width="450" height="452" rx="22" className="bd-boundary" />
      {[
        [20, 44],
        [470, 44],
        [20, 496],
        [470, 496],
      ].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}`} className="bd-cross" />
      ))}
      <text x="20" y="28" className="bd-label">
        YOUR HARDWARE
        <tspan className="bd-label-soft"> · air-gapped</tspan>
      </text>

      {/* The edges, drawn faint, then the light that runs along them. */}
      {EDGES.map((edge) => (
        <path key={edge.d} d={edge.d} className="bd-edge" />
      ))}
      <path d={OUTBOUND} className="bd-edge bd-edge-out" />
      <path d="M468 249 H500" className="bd-edge bd-edge-cut" />

      <g className="bd-pulses">
        {EDGES.map((edge) => (
          <circle key={`p-${edge.d}`} r="3.4" style={{ fill: edge.color }} opacity="0">
            <animateMotion
              dur={`${CYCLE}s`}
              begin={`${edge.begin}s`}
              repeatCount="indefinite"
              path={edge.d}
              keyTimes="0;0.24;1"
              keyPoints="0;1;1"
              calcMode="linear"
            />
            <animate
              attributeName="opacity"
              dur={`${CYCLE}s`}
              begin={`${edge.begin}s`}
              repeatCount="indefinite"
              values="0;1;1;0;0"
              keyTimes="0;0.03;0.22;0.3;1"
            />
          </circle>
        ))}
        {/* Toward the cloud: it reaches the boundary, and goes no further. */}
        <circle r="3.4" style={{ fill: 'var(--ctp-red)' }} opacity="0">
          <animateMotion dur={`${CYCLE}s`} begin="1.3s" repeatCount="indefinite" path={OUTBOUND} keyTimes="0;0.26;1" keyPoints="0;1;1" calcMode="linear" />
          <animate attributeName="opacity" dur={`${CYCLE}s`} begin="1.3s" repeatCount="indefinite" values="0;0.9;0.9;0;0" keyTimes="0;0.03;0.25;0.3;1" />
        </circle>
        <circle cx="470" cy="249" r="4" className="bd-hit" opacity="0">
          <animate attributeName="r" dur={`${CYCLE}s`} begin="2.2s" repeatCount="indefinite" values="4;16;16" keyTimes="0;0.18;1" />
          <animate attributeName="opacity" dur={`${CYCLE}s`} begin="2.2s" repeatCount="indefinite" values="0.8;0;0" keyTimes="0;0.18;1" />
        </circle>
      </g>

      {/* The cut, on the boundary itself. */}
      <g className="bd-x" transform="translate(470 249)">
        <circle r="10" />
        <path d="M-4 -4 L4 4 M4 -4 L-4 4" />
      </g>

      {/* Outside: where a cloud product would send it. */}
      <g transform="translate(500 220)" className="bd-cloud">
        <rect width="108" height="58" rx="10" />
        <text x="54" y="26" textAnchor="middle" className="bd-title">Cloud API</text>
        <text x="54" y="43" textAnchor="middle" className="bd-sub">no route out</text>
      </g>

      {NODES.map((node, n) => (
        <g key={node.id} transform={`translate(${node.x} ${node.y})`} className="bd-node" style={{ ['--i' as string]: n }}>
          <rect width="176" height="58" rx="10" className="bd-card" />
          <rect x="152" y="12" width="12" height="12" rx="3" style={{ fill: node.chip }} />
          <text x="16" y="26" className="bd-title">
            {node.title}
          </text>
          <text x="16" y="43" className="bd-sub">
            {node.sub}
          </text>
        </g>
      ))}
    </svg>
  )
}
