"use client";

/**
 * The containment scene.
 *
 * Not decoration: it animates the one thing the product claims. Inside a
 * closed boundary — the customer's own machine — documents, models and tools
 * exchange work continuously. Packets that drift outward strike the boundary
 * and are turned back, visibly. Nothing crosses.
 *
 * Built to stay cheap on a CPU-only workstation: low geometry counts, capped
 * pixel ratio, animation paused when the canvas is off-screen or the viewer
 * has asked for reduced motion.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const INK = "#D6E3E7";
const BRASS = "#C9A227";
const LIVE = "#2FBF9E";
const ALARM = "#DE5B4F";

const BOUNDARY_RADIUS = 3.05;

/** The nodes that live inside the host, in the language of the workbench. */
const NODES: { id: string; label: string; position: [number, number, number]; colour: string }[] = [
  { id: "docs", label: "Your documents", position: [-1.65, 0.75, 0.35], colour: INK },
  { id: "vision", label: "Vision model", position: [1.5, 1.05, -0.45], colour: LIVE },
  { id: "reason", label: "Reasoning model", position: [1.75, -0.5, 0.55], colour: LIVE },
  { id: "sandbox", label: "Sandbox", position: [-0.35, -1.45, -0.5], colour: BRASS },
  { id: "kb", label: "Your SOPs", position: [-1.85, -0.6, 0.4], colour: INK },
  { id: "out", label: "Deliverable", position: [0.25, 1.55, 0.4], colour: BRASS },
];

const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [4, 2],
  [2, 3],
  [3, 2],
  [2, 5],
  [0, 4],
];

/** The perimeter: a faceted shell standing for the host's boundary. */
function Boundary({ pulse }: { pulse: React.MutableRefObject<number> }) {
  const mesh = useRef<THREE.LineSegments>(null);
  const glow = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const base = new THREE.IcosahedronGeometry(BOUNDARY_RADIUS, 1);
    return new THREE.WireframeGeometry(base);
  }, []);

  useFrame((_, delta) => {
    if (mesh.current) {
      mesh.current.rotation.y += delta * 0.055;
      mesh.current.rotation.x += delta * 0.017;
    }
    if (glow.current) {
      // Flares briefly whenever a packet is turned back.
      pulse.current = Math.max(0, pulse.current - delta * 1.7);
      const material = glow.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.03 + pulse.current * 0.11;
      glow.current.rotation.y += delta * 0.055;
    }
  });

  return (
    <group>
      <lineSegments ref={mesh} geometry={geometry}>
        <lineBasicMaterial color={LIVE} transparent opacity={0.24} />
      </lineSegments>
      <mesh ref={glow}>
        <icosahedronGeometry args={[BOUNDARY_RADIUS - 0.02, 1]} />
        <meshBasicMaterial color={LIVE} transparent opacity={0.03} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/** One component of the workbench, drawn as an instrument node. */
function Node({
  position,
  colour,
  index,
}: {
  position: [number, number, number];
  colour: string;
  index: number;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const time = state.clock.elapsedTime;
    // A slow, uncorrelated drift so the cluster reads as alive, not spinning.
    group.current.position.y = position[1] + Math.sin(time * 0.5 + index) * 0.075;
    group.current.rotation.y = time * 0.25 + index;
  });

  return (
    <group ref={group} position={position}>
      <mesh>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial
          color={colour}
          emissive={colour}
          emissiveIntensity={0.45}
          roughness={0.35}
          metalness={0.65}
        />
      </mesh>
      <mesh scale={1.55}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshBasicMaterial color={colour} wireframe transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

/** The work moving between components. */
function Traffic() {
  const count = LINKS.length;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const progress = useRef<number[]>(LINKS.map((_, index) => index / count));

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let index = 0; index < count; index += 1) {
      progress.current[index] += delta * (0.22 + (index % 3) * 0.05);
      if (progress.current[index] > 1) progress.current[index] = 0;

      const [from, to] = LINKS[index];
      const start = new THREE.Vector3(...NODES[from].position);
      const end = new THREE.Vector3(...NODES[to].position);
      const point = start.clone().lerp(end, progress.current[index]);
      // Bow the path outward so traffic reads as travelling, not sliding.
      point.multiplyScalar(1 + Math.sin(progress.current[index] * Math.PI) * 0.16);

      dummy.position.copy(point);
      dummy.scale.setScalar(0.055 + Math.sin(progress.current[index] * Math.PI) * 0.03);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={BRASS} />
    </instancedMesh>
  );
}

/**
 * A packet that tries to leave and is turned back at the perimeter.
 *
 * This is the scene's argument: the outbound attempt is drawn, and so is its
 * refusal.
 */
function Deflection({ pulse }: { pulse: React.MutableRefObject<number> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const state = useRef({ t: 0, dir: new THREE.Vector3(1, 0.35, 0.4).normalize(), cooldown: 2.2 });

  useFrame((_, delta) => {
    if (!mesh.current) return;
    const s = state.current;

    if (s.cooldown > 0) {
      s.cooldown -= delta;
      (mesh.current.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }

    s.t += delta * 1.15;
    const distance = s.t * BOUNDARY_RADIUS;
    const material = mesh.current.material as THREE.MeshBasicMaterial;

    if (distance >= BOUNDARY_RADIUS) {
      // Refused at the boundary: flare, then reset on a new heading.
      pulse.current = 1;
      s.t = 0;
      s.cooldown = 2.4 + Math.random() * 1.8;
      s.dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 1.4 - 0.7,
        Math.random() * 2 - 1,
      ).normalize();
      material.opacity = 0;
      return;
    }

    mesh.current.position.copy(s.dir.clone().multiplyScalar(distance));
    material.color.set(distance > BOUNDARY_RADIUS * 0.8 ? ALARM : BRASS);
    material.opacity = Math.min(1, s.t * 2.2);
    mesh.current.scale.setScalar(0.075);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={BRASS} transparent opacity={0} />
    </mesh>
  );
}

function Scene() {
  const pulse = useRef(0);
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    if (!group.current) return;
    // Follow the pointer gently, so the object feels held rather than driven.
    group.current.rotation.y += (pointer.x * 0.32 - group.current.rotation.y) * delta * 1.4;
    group.current.rotation.x += (-pointer.y * 0.22 - group.current.rotation.x) * delta * 1.4;
  });

  return (
    <group ref={group}>
      <ambientLight intensity={0.55} />
      <pointLight position={[4, 5, 5]} intensity={38} color={LIVE} distance={22} />
      <pointLight position={[-5, -3, 3]} intensity={22} color={BRASS} distance={20} />

      <Boundary pulse={pulse} />
      {NODES.map((node, index) => (
        <Node key={node.id} position={node.position} colour={node.colour} index={index} />
      ))}
      <Traffic />
      <Deflection pulse={pulse} />
    </group>
  );
}

export function ContainmentScene({ className = "" }: { className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  // Respect a viewer who does not want motion, and only run while visible.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setEnabled(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={holder} className={className} aria-hidden>
      {enabled && !reducedMotion ? (
        <Canvas
          camera={{ position: [0, 0, 8.4], fov: 42 }}
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          frameloop="always"
        >
          <Scene />
        </Canvas>
      ) : (
        // Static stand-in: the same idea, no animation, no GPU cost.
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative h-[240px] w-[240px]">
            <div className="absolute inset-0 rounded-full border border-live/25" />
            <div className="absolute inset-6 rounded-full border border-live/15" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="instrument text-[0.75rem] text-live">contained</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
