'use client'

/**
 * The containment scene, in three dimensions.
 *
 * Not decoration: it animates the one claim the product makes. Work circulates
 * continuously between the host and its subsystems, all of it inside a closed
 * boundary. Anything that drifts outward strikes that boundary and is turned
 * back — visibly, with a shockwave spreading from the point of contact.
 * Nothing crosses.
 *
 * It is also live. A subsystem lights up when it is genuinely busy, so during a
 * run you watch the vision model, the vector store and the sandbox take their
 * turns, rather than watching a loop that would look identical if the machine
 * were switched off.
 *
 * Built to stay cheap on a host that is also running the models: low geometry
 * counts, a capped pixel ratio, and rendering paused whenever the scene is off
 * screen or the viewer has asked for reduced motion.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

export type TopologyNodeId =
  | 'model'
  | 'vector'
  | 'sandbox'
  | 'documents'
  | 'agent'
  | 'audit'

const SOVEREIGN = '#16a34a'
const CRITICAL = '#dc2626'
const INK = '#3f3d3a'

const BOUNDARY_RADIUS = 3.2

/** The subsystems inside the host, placed around it in three dimensions. */
const NODES: {
  id: TopologyNodeId
  label: string
  position: [number, number, number]
}[] = [
  { id: 'model', label: 'LOCAL MODEL', position: [0, 1.75, 0.15] },
  { id: 'vector', label: 'VECTOR STORE', position: [1.62, 0.62, -0.5] },
  { id: 'sandbox', label: 'SANDBOX', position: [1.5, -0.95, 0.42] },
  { id: 'documents', label: 'DOCUMENT STORE', position: [0, -1.8, -0.28] },
  { id: 'agent', label: 'AGENT', position: [-1.5, -0.95, 0.4] },
  { id: 'audit', label: 'AUDIT LOG', position: [-1.62, 0.62, -0.45] },
]

/* -------------------------------------------------------------- boundary */

function Boundary({
  flare,
  breached,
}: {
  flare: React.MutableRefObject<{ strength: number; direction: THREE.Vector3 }>
  breached: boolean
}) {
  const wire = useRef<THREE.LineSegments>(null)
  const shell = useRef<THREE.Mesh>(null)

  const geometry = useMemo(
    () => new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(BOUNDARY_RADIUS, 2)),
    [],
  )

  useFrame((_, delta) => {
    if (wire.current) {
      wire.current.rotation.y += delta * 0.06
      wire.current.rotation.x += delta * 0.018
    }
    if (shell.current) {
      // Decays after each refusal, so the flare reads as an event.
      flare.current.strength = Math.max(0, flare.current.strength - delta * 1.4)
      const material = shell.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.025 + flare.current.strength * 0.16
      material.color.set(flare.current.strength > 0.05 ? CRITICAL : SOVEREIGN)
      shell.current.rotation.y += delta * 0.06
    }
  })

  return (
    <group>
      <lineSegments ref={wire} geometry={geometry}>
        <lineBasicMaterial
          color={breached ? CRITICAL : SOVEREIGN}
          transparent
          opacity={breached ? 0.4 : 0.19}
        />
      </lineSegments>
      <mesh ref={shell}>
        <icosahedronGeometry args={[BOUNDARY_RADIUS - 0.02, 2]} />
        <meshBasicMaterial
          color={SOVEREIGN}
          transparent
          opacity={0.025}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ host */

function Host() {
  const core = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)

  useFrame((state, delta) => {
    const breath = 0.5 + Math.sin(state.clock.elapsedTime * 1.4) * 0.5
    if (halo.current) {
      halo.current.scale.setScalar(1 + breath * 0.16)
      ;(halo.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + breath * 0.1
    }
    if (core.current) core.current.rotation.y += delta * 0.35
  })

  return (
    <group>
      <mesh ref={halo}>
        <sphereGeometry args={[0.52, 24, 24]} />
        <meshBasicMaterial color={SOVEREIGN} transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.4, 1]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={SOVEREIGN}
          emissiveIntensity={0.35}
          roughness={0.25}
          metalness={0.55}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.IcosahedronGeometry(0.4, 1)]} />
        <lineBasicMaterial color={SOVEREIGN} transparent opacity={0.6} />
      </lineSegments>
    </group>
  )
}

/* ----------------------------------------------------------------- nodes */

function Node({
  position,
  busy,
  index,
}: {
  position: [number, number, number]
  busy: boolean
  index: number
}) {
  const group = useRef<THREE.Group>(null)
  const glow = useRef<THREE.Mesh>(null)

  useFrame((state, delta) => {
    if (!group.current) return
    const t = state.clock.elapsedTime
    // Uncorrelated drift, so the cluster reads as alive rather than spinning.
    group.current.position.y = position[1] + Math.sin(t * 0.55 + index) * 0.055
    group.current.rotation.y += delta * 0.28

    if (glow.current) {
      const pulse = 0.5 + Math.sin(t * 3.2 + index) * 0.5
      const material = glow.current.material as THREE.MeshBasicMaterial
      material.opacity = busy ? 0.14 + pulse * 0.2 : 0
      glow.current.scale.setScalar(busy ? 1.5 + pulse * 0.4 : 1)
    }
  })

  return (
    <group ref={group} position={position}>
      <mesh ref={glow}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshBasicMaterial color={SOVEREIGN} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={busy ? SOVEREIGN : '#000000'}
          emissiveIntensity={busy ? 0.5 : 0}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(0.22, 0.22, 0.22)]} />
        <lineBasicMaterial color={busy ? SOVEREIGN : INK} transparent opacity={busy ? 0.9 : 0.35} />
      </lineSegments>
    </group>
  )
}

/* ----------------------------------------------------------------- links */

function Links() {
  const geometry = useMemo(() => {
    const points: number[] = []
    for (const node of NODES) {
      points.push(0, 0, 0, ...node.position)
    }
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    return buffer
  }, [])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={INK} transparent opacity={0.22} />
    </lineSegments>
  )
}

/* --------------------------------------------------------------- traffic */

function Traffic({ tempo }: { tempo: React.MutableRefObject<number> }) {
  const count = NODES.length
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const progress = useRef<number[]>(NODES.map((_, i) => i / count))
  const outbound = useRef<boolean[]>(NODES.map((_, i) => i % 2 === 0))

  useFrame((_, delta) => {
    const instanced = mesh.current
    if (!instanced) return

    for (let i = 0; i < count; i += 1) {
      progress.current[i] += delta * (0.22 + (i % 3) * 0.05) * tempo.current
      if (progress.current[i] > 1) {
        progress.current[i] = 0
        outbound.current[i] = !outbound.current[i]
      }

      const raw = progress.current[i]
      // Ease so a packet settles into its destination rather than arriving flat.
      const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2
      const travel = outbound.current[i] ? eased : 1 - eased

      const target = new THREE.Vector3(...NODES[i].position)
      const point = target.clone().multiplyScalar(travel)

      dummy.position.copy(point)
      dummy.scale.setScalar(0.05 + Math.sin(raw * Math.PI) * 0.028)
      dummy.updateMatrix()
      instanced.setMatrixAt(i, dummy.matrix)
    }
    instanced.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial color={SOVEREIGN} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------- escape + refusal */

function Escape({
  flare,
}: {
  flare: React.MutableRefObject<{ strength: number; direction: THREE.Vector3 }>
}) {
  const head = useRef<THREE.Mesh>(null)
  const trail = useRef<THREE.Mesh>(null)
  const state = useRef({
    t: 0,
    direction: new THREE.Vector3(1, 0.4, 0.35).normalize(),
    cooldown: 2.4,
    returning: false,
  })

  useFrame((_, delta) => {
    if (!head.current || !trail.current) return
    const s = state.current
    const headMaterial = head.current.material as THREE.MeshBasicMaterial
    const trailMaterial = trail.current.material as THREE.MeshBasicMaterial

    if (s.cooldown > 0) {
      s.cooldown -= delta
      headMaterial.opacity = 0
      trailMaterial.opacity = 0
      return
    }

    s.t += delta * (s.returning ? 2.0 : 1.05)
    const eased = 1 - Math.pow(1 - Math.min(s.t, 1), 3)
    const distance = s.returning
      ? BOUNDARY_RADIUS - (BOUNDARY_RADIUS - 0.5) * eased
      : 0.5 + (BOUNDARY_RADIUS - 0.5) * eased

    head.current.position.copy(s.direction.clone().multiplyScalar(distance))

    // A stretched trail behind the head, so the refusal is readable.
    const back = Math.max(0.4, distance - 0.55)
    trail.current.position.copy(s.direction.clone().multiplyScalar((distance + back) / 2))
    trail.current.scale.set(0.02, Math.max(0.05, (distance - back) / 2), 0.02)
    trail.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      s.direction.clone().normalize(),
    )

    const nearEdge = distance > BOUNDARY_RADIUS * 0.82
    const colour = s.returning || nearEdge ? CRITICAL : '#b45309'
    headMaterial.color.set(colour)
    trailMaterial.color.set(colour)
    headMaterial.opacity = 1
    trailMaterial.opacity = 0.45

    if (!s.returning && s.t >= 1) {
      // Refused at the boundary: flare there, then send it back inside.
      flare.current.strength = 1
      flare.current.direction.copy(s.direction)
      s.returning = true
      s.t = 0
    } else if (s.returning && s.t >= 1) {
      s.returning = false
      s.t = 0
      s.cooldown = 3.4 + Math.random() * 2.6
      s.direction = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 1.6 - 0.8,
        Math.random() * 2 - 1,
      ).normalize()
      headMaterial.opacity = 0
      trailMaterial.opacity = 0
    }
  })

  return (
    <group>
      <mesh ref={trail}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshBasicMaterial color={CRITICAL} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={head}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshBasicMaterial color={CRITICAL} transparent opacity={0} />
      </mesh>
    </group>
  )
}

/* -------------------------------------------------- shockwave at the edge */

function Shockwave({
  flare,
}: {
  flare: React.MutableRefObject<{ strength: number; direction: THREE.Vector3 }>
}) {
  const ring = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (!ring.current) return
    const strength = flare.current.strength
    const material = ring.current.material as THREE.MeshBasicMaterial
    material.opacity = strength * 0.7

    if (strength > 0.01) {
      const point = flare.current.direction.clone().multiplyScalar(BOUNDARY_RADIUS)
      ring.current.position.copy(point)
      ring.current.lookAt(0, 0, 0)
      ring.current.scale.setScalar(0.3 + (1 - strength) * 1.9)
    }
  })

  return (
    <mesh ref={ring}>
      <ringGeometry args={[0.34, 0.42, 40]} />
      <meshBasicMaterial
        color={CRITICAL}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ----------------------------------------------------------------- scene */

function Scene({
  active,
  activeNodes,
  breached,
}: {
  active: boolean
  activeNodes: TopologyNodeId[]
  breached: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const { pointer } = useThree()
  const tempo = useRef(1)
  const flare = useRef({ strength: 0, direction: new THREE.Vector3(1, 0, 0) })

  tempo.current = active ? 2.1 : 1

  useFrame((state, delta) => {
    if (!group.current) return
    // A slow turn of its own, plus a gentle lean towards the pointer, so the
    // object feels held rather than driven.
    group.current.rotation.y +=
      delta * 0.12 + (pointer.x * 0.4 - group.current.rotation.y * 0.02) * delta
    group.current.rotation.x +=
      (-pointer.y * 0.22 - group.current.rotation.x) * delta * 1.1
  })

  return (
    <group ref={group}>
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 6, 5]} intensity={1.5} />
      <pointLight position={[-4, -2, 3]} intensity={12} color={SOVEREIGN} distance={16} />

      <Boundary flare={flare} breached={breached} />
      <Links />
      {NODES.map((node, index) => (
        <Node
          key={node.id}
          position={node.position}
          busy={activeNodes.includes(node.id)}
          index={index}
        />
      ))}
      <Traffic tempo={tempo} />
      <Escape flare={flare} />
      <Shockwave flare={flare} />
      <Host />
    </group>
  )
}

/* ------------------------------------------------------------- component */

export function SovereigntyTopology({
  active = false,
  activeNodes = [],
  breached = false,
  className = '',
}: {
  /** True while a task is running: the whole scene quickens. */
  active?: boolean
  /** Subsystems currently doing work. */
  activeNodes?: TopologyNodeId[]
  /** True only if the monitor actually observed egress. */
  breached?: boolean
  className?: string
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)

  const [supported, setSupported] = useState(true)

  useEffect(() => {
    // Some hosts have no WebGL at all. Detect it rather than letting the
    // renderer throw and take the page with it.
    try {
      const probe = document.createElement('canvas')
      setSupported(
        Boolean(probe.getContext('webgl2') || probe.getContext('webgl')),
      )
    } catch {
      setSupported(false)
    }
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const element = holder.current
    if (!element) return
    // Rendering an off-screen scene is CPU taken from the models.
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={holder} className={`relative h-full w-full ${className}`} aria-hidden>
      {visible && !reduced && supported ? (
        <Canvas
          camera={{ position: [0, 0, 11.2], fov: 40 }}
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        >
          <Scene active={active} activeNodes={activeNodes} breached={breached} />
        </Canvas>
      ) : (
        // Same idea, no motion and no GPU cost.
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative h-[220px] w-[220px]">
            <div className="absolute inset-0 rounded-full border border-border" />
            <div className="absolute inset-8 rounded-full border border-border" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-[11px] text-foreground-muted">
                {supported ? 'CONTAINED' : 'CONTAINED · 3D unavailable here'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* The subsystem names, as HTML so they stay crisp and readable. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-4">
        {NODES.map((node) => {
          const busy = activeNodes.includes(node.id)
          return (
            <span
              key={node.id}
              className={`font-mono text-[10px] tracking-[0.14em] transition-colors ${
                busy ? 'text-sovereign' : 'text-foreground-muted'
              }`}
            >
              {busy ? '● ' : '○ '}
              {node.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
