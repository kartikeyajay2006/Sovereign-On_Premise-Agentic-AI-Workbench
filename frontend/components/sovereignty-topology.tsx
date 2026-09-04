'use client'

/**
 * The workbench, in three dimensions.
 *
 * This is the job the platform actually does, drawn rather than described: a
 * scanned inspection report enters, and travels a circuit of stations inside a
 * closed boundary. It is read line by line, matched against the organisation's
 * own procedures, its figures recomputed, checked, signed by a human, and
 * filed. The page visibly changes at each station — marks appear as it is
 * read, citation tags fly in from the procedure shelf, a stamp lands when it
 * is approved.
 *
 * Around all of it sits the boundary. Every few seconds something drifts
 * outward, strikes it and is turned back, with the shell flaring at the point
 * of contact. That refusal is the claim the whole product rests on, so it is
 * shown, not captioned.
 *
 * The circuit follows the real run when one is in progress: the station doing
 * the work lights up and the document waits there. Idle, it cycles gently.
 *
 * Built to stay cheap on a host that is also running the models — low geometry,
 * capped pixel ratio, paused off screen, static under reduced motion.
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
const AMBER = '#b45309'
const PAPER = '#fbfbf9'
const INK = '#3f3d3a'

const BOUNDARY_RADIUS = 3.15
const STATION_RADIUS = 2.2

/**
 * The stations, in the order a document passes through them. These are the
 * platform's real stages, named as the work they do.
 */
const STATIONS: {
  id: TopologyNodeId
  label: string
  caption: string
}[] = [
  { id: 'documents', label: 'INTAKE', caption: 'the scan arrives' },
  { id: 'model', label: 'READ', caption: 'vision model' },
  { id: 'vector', label: 'YOUR SOPs', caption: 'retrieval' },
  { id: 'sandbox', label: 'RECOMPUTE', caption: 'sandbox' },
  { id: 'agent', label: 'APPROVE', caption: 'a person signs' },
  { id: 'audit', label: 'FILED', caption: 'audit record' },
]

function stationPosition(index: number): THREE.Vector3 {
  const angle = (index / STATIONS.length) * Math.PI * 2 - Math.PI / 2
  // A slight tilt out of plane so the circuit reads as three-dimensional.
  return new THREE.Vector3(
    Math.cos(angle) * STATION_RADIUS,
    Math.sin(angle) * STATION_RADIUS * 0.86,
    Math.sin(angle * 2) * 0.42,
  )
}

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
      wire.current.rotation.y += delta * 0.05
      wire.current.rotation.x += delta * 0.015
    }
    if (shell.current) {
      flare.current.strength = Math.max(0, flare.current.strength - delta * 1.4)
      const material = shell.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.02 + flare.current.strength * 0.15
      material.color.set(flare.current.strength > 0.05 ? CRITICAL : SOVEREIGN)
    }
  })

  return (
    <group>
      <lineSegments ref={wire} geometry={geometry}>
        <lineBasicMaterial
          color={breached ? CRITICAL : SOVEREIGN}
          transparent
          opacity={breached ? 0.42 : 0.22}
        />
      </lineSegments>
      <mesh ref={shell}>
        <icosahedronGeometry args={[BOUNDARY_RADIUS - 0.02, 2]} />
        <meshBasicMaterial
          color={SOVEREIGN}
          transparent
          opacity={0.02}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------- the sheet */

/**
 * The document itself. Marks accumulate on it as it moves round the circuit,
 * so by the time it reaches the end it visibly carries its own evidence.
 */
function Sheet({
  stage,
  progress,
}: {
  stage: React.MutableRefObject<number>
  progress: React.MutableRefObject<number>
}) {
  const group = useRef<THREE.Group>(null)
  const scanLine = useRef<THREE.Mesh>(null)
  const stamp = useRef<THREE.Mesh>(null)

  // Ruled lines, so it reads as a page of text rather than a blank card.
  const lines = useMemo(() => [0.44, 0.30, 0.16, 0.02, -0.12, -0.26, -0.40], [])

  useFrame((state, delta) => {
    if (!group.current) return
    const t = state.clock.elapsedTime

    const from = stationPosition(stage.current)
    const to = stationPosition((stage.current + 1) % STATIONS.length)
    // Ease between stations, and hold briefly on arrival.
    const raw = Math.min(1, progress.current)
    const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2
    const position = from.clone().lerp(to, eased)
    // Bow the path outward so travel is legible.
    position.multiplyScalar(1 + Math.sin(eased * Math.PI) * 0.06)

    group.current.position.copy(position)
    group.current.rotation.y = Math.sin(t * 0.5) * 0.35 + eased * Math.PI * 0.12
    group.current.rotation.z = Math.sin(t * 0.35) * 0.06

    // Reading: a bar sweeps the page while it sits at the READ station.
    if (scanLine.current) {
      const reading = stage.current === 1
      const material = scanLine.current.material as THREE.MeshBasicMaterial
      material.opacity = reading ? 0.75 : 0
      if (reading) scanLine.current.position.y = ((t * 0.9) % 1) * 1.06 - 0.53
    }

    // The stamp lands once the document has been signed.
    if (stamp.current) {
      const signed = stage.current >= 4
      const material = stamp.current.material as THREE.MeshBasicMaterial
      material.opacity = signed ? 0.85 : 0
      stamp.current.scale.setScalar(signed ? 1 + Math.sin(t * 2.4) * 0.03 : 0.01)
    }
  })

  return (
    <group ref={group}>
      {/* the page */}
      <mesh>
        <planeGeometry args={[0.92, 1.24]} />
        <meshStandardMaterial
          color={PAPER}
          side={THREE.DoubleSide}
          roughness={0.85}
          metalness={0}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.92, 1.24)]} />
        <lineBasicMaterial color={INK} transparent opacity={0.45} />
      </lineSegments>

      {/* ruled text lines */}
      {lines.map((y, index) => (
        <mesh key={y} position={[index % 3 === 2 ? -0.12 : 0, y, 0.002]}>
          <planeGeometry args={[index % 3 === 2 ? 0.4 : 0.66, 0.026]} />
          <meshBasicMaterial color={INK} transparent opacity={0.32} />
        </mesh>
      ))}

      {/* the reading bar */}
      <mesh ref={scanLine} position={[0, 0, 0.006]}>
        <planeGeometry args={[0.92, 0.05]} />
        <meshBasicMaterial color={SOVEREIGN} transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* the approval stamp */}
      <mesh ref={stamp} position={[0.24, -0.38, 0.008]} rotation={[0, 0, -0.24]}>
        <ringGeometry args={[0.12, 0.16, 24]} />
        <meshBasicMaterial color={SOVEREIGN} transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ---------------------------------------------------------- the stations */

function Station({
  index,
  busy,
}: {
  index: number
  busy: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Mesh>(null)
  const position = useMemo(() => stationPosition(index), [index])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (halo.current) {
      const pulse = 0.5 + Math.sin(t * 3 + index) * 0.5
      const material = halo.current.material as THREE.MeshBasicMaterial
      material.opacity = busy ? 0.14 + pulse * 0.2 : 0.04
      halo.current.scale.setScalar(busy ? 1.25 + pulse * 0.3 : 1)
    }
    if (group.current) group.current.rotation.y = t * 0.2 + index
  })

  return (
    <group position={position}>
      <mesh ref={halo}>
        <sphereGeometry args={[0.36, 16, 16]} />
        <meshBasicMaterial color={SOVEREIGN} transparent opacity={0.04} depthWrite={false} />
      </mesh>
      <group ref={group}>
        <mesh>
          <cylinderGeometry args={[0.21, 0.21, 0.15, 6]} />
          <meshStandardMaterial
            color={busy ? '#1c5f34' : '#393733'}
            emissive={busy ? SOVEREIGN : '#000000'}
            emissiveIntensity={busy ? 0.75 : 0}
            roughness={0.45}
            metalness={0.3}
          />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.CylinderGeometry(0.21, 0.21, 0.15, 6)]} />
          <lineBasicMaterial color={busy ? SOVEREIGN : '#8d8a84'} transparent opacity={busy ? 1 : 0.65} />
        </lineSegments>
      </group>
    </group>
  )
}

/** The circuit the document travels, drawn as a faint closed path. */
function Circuit() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = []
    const segments = 120
    for (let i = 0; i <= segments; i += 1) {
      const at = (i / segments) * STATIONS.length
      const from = stationPosition(Math.floor(at) % STATIONS.length)
      const to = stationPosition((Math.floor(at) + 1) % STATIONS.length)
      const local = at - Math.floor(at)
      const point = from.clone().lerp(to, local)
      point.multiplyScalar(1 + Math.sin(local * Math.PI) * 0.06)
      points.push(point)
    }
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [])

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={INK} transparent opacity={0.26} />
    </line>
  )
}

/* --------------------------------------------- citations from the shelf */

/**
 * When the document reaches the procedure station, tags fly from the shelf and
 * attach to it — the citations the finished note carries.
 */
function Citations({ stage }: { stage: React.MutableRefObject<number> }) {
  const count = 3
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const offsets = useMemo(() => [0, 0.34, 0.68], [])

  useFrame((state) => {
    const instanced = mesh.current
    if (!instanced) return
    const t = state.clock.elapsedTime
    const shelf = stationPosition(2)
    const active = stage.current === 2

    for (let i = 0; i < count; i += 1) {
      const local = active ? ((t * 0.7 + offsets[i]) % 1) : 1
      const target = stationPosition(2)
      const point = shelf
        .clone()
        .lerp(target, local)
        .add(new THREE.Vector3(Math.sin(t + i) * 0.16, 0.2 - local * 0.4, Math.cos(t + i) * 0.16))
      dummy.position.copy(point)
      dummy.scale.setScalar(active ? 0.055 * (1 - local * 0.4) : 0)
      dummy.updateMatrix()
      instanced.setMatrixAt(i, dummy.matrix)
    }
    instanced.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 0.15]} />
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
    cooldown: 2.2,
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

    s.t += delta * (s.returning ? 2.1 : 1.0)
    const eased = 1 - Math.pow(1 - Math.min(s.t, 1), 3)
    const distance = s.returning
      ? BOUNDARY_RADIUS - (BOUNDARY_RADIUS - 0.6) * eased
      : 0.6 + (BOUNDARY_RADIUS - 0.6) * eased

    head.current.position.copy(s.direction.clone().multiplyScalar(distance))

    const back = Math.max(0.5, distance - 0.6)
    trail.current.position.copy(s.direction.clone().multiplyScalar((distance + back) / 2))
    trail.current.scale.set(0.018, Math.max(0.05, (distance - back) / 2), 0.018)
    trail.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.direction.clone())

    const nearEdge = distance > BOUNDARY_RADIUS * 0.8
    const colour = s.returning || nearEdge ? CRITICAL : AMBER
    headMaterial.color.set(colour)
    trailMaterial.color.set(colour)
    headMaterial.opacity = 1
    trailMaterial.opacity = 0.42

    if (!s.returning && s.t >= 1) {
      flare.current.strength = 1
      flare.current.direction.copy(s.direction)
      s.returning = true
      s.t = 0
    } else if (s.returning && s.t >= 1) {
      s.returning = false
      s.t = 0
      s.cooldown = 3.2 + Math.random() * 2.4
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
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color={CRITICAL} transparent opacity={0} />
      </mesh>
    </group>
  )
}

function Shockwave({
  flare,
}: {
  flare: React.MutableRefObject<{ strength: number; direction: THREE.Vector3 }>
}) {
  const ring = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (!ring.current) return
    const strength = flare.current.strength
    ;(ring.current.material as THREE.MeshBasicMaterial).opacity = strength * 0.7
    if (strength > 0.01) {
      ring.current.position.copy(flare.current.direction.clone().multiplyScalar(BOUNDARY_RADIUS))
      ring.current.lookAt(0, 0, 0)
      ring.current.scale.setScalar(0.3 + (1 - strength) * 2)
    }
  })

  return (
    <mesh ref={ring}>
      <ringGeometry args={[0.32, 0.4, 40]} />
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
  onStageChange,
}: {
  active: boolean
  activeNodes: TopologyNodeId[]
  breached: boolean
  onStageChange: (index: number) => void
}) {
  const group = useRef<THREE.Group>(null)
  const { pointer } = useThree()
  const stage = useRef(0)
  const progress = useRef(0)
  const flare = useRef({ strength: 0, direction: new THREE.Vector3(1, 0, 0) })

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.09
      group.current.rotation.x +=
        (-pointer.y * 0.2 - group.current.rotation.x) * delta * 1.1
    }

    // During a real run the document waits at whichever station is working.
    const busyIndex = STATIONS.findIndex((s) => activeNodes.includes(s.id))
    if (active && busyIndex >= 0) {
      if (stage.current !== busyIndex) {
        progress.current += delta * 0.9
        if (progress.current >= 1) {
          progress.current = 0
          stage.current = (stage.current + 1) % STATIONS.length
          onStageChange(stage.current)
        }
      } else {
        progress.current = 0
      }
      return
    }

    // Idle: a gentle continuous circuit, so the story is always legible.
    progress.current += delta * 0.36
    if (progress.current >= 1) {
      progress.current = 0
      stage.current = (stage.current + 1) % STATIONS.length
      onStageChange(stage.current)
    }
  })

  return (
    <group ref={group}>
      <ambientLight intensity={1.15} />
      <directionalLight position={[4, 6, 6]} intensity={1.6} />
      <pointLight position={[-4, -2, 3]} intensity={10} color={SOVEREIGN} distance={16} />

      <Boundary flare={flare} breached={breached} />
      <Circuit />
      {STATIONS.map((station, index) => (
        <Station
          key={station.id}
          index={index}
          busy={activeNodes.includes(station.id) || (!active && stage.current === index)}
        />
      ))}
      <Citations stage={stage} />
      <Sheet stage={stage} progress={progress} />
      <Escape flare={flare} />
      <Shockwave flare={flare} />
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
  active?: boolean
  activeNodes?: TopologyNodeId[]
  breached?: boolean
  className?: string
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [supported, setSupported] = useState(true)
  const [stage, setStage] = useState(0)

  useEffect(() => {
    try {
      const probe = document.createElement('canvas')
      setSupported(Boolean(probe.getContext('webgl2') || probe.getContext('webgl')))
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
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const liveIndex = STATIONS.findIndex((s) => activeNodes.includes(s.id))
  const current = active && liveIndex >= 0 ? liveIndex : stage

  return (
    <div ref={holder} className={`relative h-full w-full ${className}`}>
      {visible && !reduced && supported ? (
        <Canvas
          camera={{ position: [0, 0, 9.1], fov: 42 }}
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        >
          <Scene
            active={active}
            activeNodes={activeNodes}
            breached={breached}
            onStageChange={setStage}
          />
        </Canvas>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative h-[200px] w-[200px]">
            <div className="absolute inset-0 rounded-full border border-border" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-[11px] text-foreground-muted">
                {supported ? 'CONTAINED' : 'CONTAINED · 3D unavailable here'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* The stations, named as the work they do, with the live one marked. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4">
        {STATIONS.map((station, index) => {
          const on = index === current
          return (
            <span key={station.id} className="flex flex-col items-center leading-tight">
              <span
                className={`font-mono text-[10px] tracking-[0.16em] transition-colors ${
                  on ? 'text-sovereign' : 'text-foreground-muted'
                }`}
              >
                {on ? '●' : '○'} {station.label}
              </span>
              <span
                className={`text-[10px] transition-colors ${
                  on ? 'text-foreground-secondary' : 'text-foreground-muted/60'
                }`}
              >
                {station.caption}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
