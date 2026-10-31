import { Html, OrbitControls, QuadraticBezierLine } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { TwinGraph, TwinNode } from '../lib/api'

/* Equirectangular projection of ASEAN onto a flat "table" in the scene. */
const CENTER = { lat: 6, lon: 107 }
const SCALE = 0.32
export const project = (lat: number, lon: number): [number, number, number] => [(lon - CENTER.lon) * SCALE, 0, -(lat - CENTER.lat) * SCALE]

export interface SatNode {
  id: string
  label: string
  stage: string
}

function useColors() {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim() || '#888'
  return { accent: v('--accent'), brand: v('--brand'), line: v('--line'), muted: v('--muted'), ink: v('--ink'), surface: v('--surface-2') }
}

function DotField({ color }: { color: string }) {
  const geo = useMemo(() => {
    const pts: number[] = []
    for (let x = -9; x <= 9; x += 0.35) for (let z = -6; z <= 6; z += 0.35) pts.push(x, -0.02, z)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  return (
    <points geometry={geo}>
      <pointsMaterial color={color} size={0.035} sizeAttenuation transparent opacity={0.6} />
    </points>
  )
}

function Hub({ node, selected, color, mutedColor, onSelect, labels }: { node: TwinNode; selected: boolean; color: string; mutedColor: string; onSelect: (id: string) => void; labels: boolean }) {
  const [x, , z] = project(node.lat, node.lon)
  const total = node.counts.records + node.counts.agencies + node.counts.opportunities
  const h = node.covered ? 0.25 + total * 0.035 : 0.12
  const ring = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (ring.current && selected) ring.current.rotation.z += dt * 0.8
  })
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, h / 2, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node.id)
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <cylinderGeometry args={[0.16, 0.2, h, 24]} />
        <meshStandardMaterial color={node.covered ? color : mutedColor} emissive={node.covered ? color : '#000'} emissiveIntensity={node.covered ? 0.25 : 0} roughness={0.4} />
      </mesh>
      {selected && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.34, 0.4, 40, 1, 0, Math.PI * 1.6]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      )}
      {labels && (
        <Html position={[0, h + 0.25, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <span
            style={{
              whiteSpace: 'nowrap',
              fontFamily: 'Geist, sans-serif',
              fontSize: 13,
              fontWeight: selected ? 600 : 500,
              color: 'var(--ink)',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              padding: '2px 8px',
              borderRadius: 999,
              opacity: node.covered || selected ? 1 : 0.7,
            }}
          >
            {node.label}
          </span>
        </Html>
      )}
    </group>
  )
}

function Traveller({ start, end, mid, color, speed = 0.35, offset = 0, animate }: { start: THREE.Vector3; end: THREE.Vector3; mid: THREE.Vector3; color: string; speed?: number; offset?: number; animate: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(start, mid, end), [start, mid, end])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = animate ? (clock.elapsedTime * speed + offset) % 1 : 0.5
    ref.current.position.copy(curve.getPoint(t))
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

function Arc({ from, to, color, height = 1.6, width = 2, animate, dashed }: { from: [number, number, number]; to: [number, number, number]; color: string; height?: number; width?: number; animate: boolean; dashed?: boolean }) {
  const start = useMemo(() => new THREE.Vector3(...from), [from])
  const end = useMemo(() => new THREE.Vector3(...to), [to])
  const mid = useMemo(() => start.clone().lerp(end, 0.5).setY(height), [start, end, height])
  return (
    <>
      <QuadraticBezierLine start={start} end={end} mid={mid} color={color} lineWidth={width} dashed={dashed} dashSize={0.15} gapSize={0.1} />
      <Traveller start={start} end={end} mid={mid} color={color} animate={animate} offset={Math.abs(from[0] + to[2]) % 1} />
    </>
  )
}

function Satellites({ target, sats, color, lineColor, animate, labels }: { target: [number, number, number]; sats: SatNode[]; color: string; lineColor: string; animate: boolean; labels: boolean }) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (group.current && animate) group.current.rotation.y += dt * 0.05
  })
  const radius = 1.25
  return (
    <group ref={group} position={target}>
      {sats.map((s, i) => {
        const a = (i / sats.length) * Math.PI * 2
        const p: [number, number, number] = [Math.cos(a) * radius, 0.7 + (i % 3) * 0.2, Math.sin(a) * radius]
        return (
          <group key={s.id}>
            <QuadraticBezierLine start={[0, 0.3, 0]} end={p} mid={[p[0] / 2, p[1] + 0.4, p[2] / 2]} color={lineColor} lineWidth={1} transparent opacity={0.7} />
            <mesh position={p}>
              <octahedronGeometry args={[0.09]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
            </mesh>
            {labels && i % 2 === 0 && (
              <Html position={[p[0], p[1] + 0.2, p[2]]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
                <span style={{ whiteSpace: 'nowrap', fontFamily: 'Geist, sans-serif', fontSize: 11, color: 'var(--muted)' }}>{s.label.length > 28 ? s.label.slice(0, 27) + '...' : s.label}</span>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

export default function TwinScene({
  graph,
  selected,
  onSelect,
  animate = true,
  labels = true,
  interactive = true,
  satellites = [],
}: {
  graph: Pick<TwinGraph, 'nodes' | 'mission'>
  selected?: string | null
  onSelect?: (id: string) => void
  animate?: boolean
  labels?: boolean
  interactive?: boolean
  satellites?: SatNode[]
}) {
  const c = useColors()
  const byId = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph.nodes])
  const m = graph.mission
  const origin = m && byId[m.origin]
  const target = m && byId[m.target]

  return (
    <Canvas camera={{ position: [0, 9.5, 10.5], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={1.1} />
      <DotField color={c.muted} />
      {graph.nodes.map((n) => (
        <Hub key={n.id} node={n} selected={selected === n.id} color={c.accent} mutedColor={c.line} onSelect={onSelect ?? (() => {})} labels={labels} />
      ))}
      {origin && target && (
        <>
          <Arc from={project(origin.lat, origin.lon)} to={project(target.lat, target.lon)} color={c.accent} height={2.2} width={3} animate={animate} />
          <Satellites target={project(target.lat, target.lon)} sats={satellites} color={c.accent} lineColor={c.muted} animate={animate} labels={false} />
        </>
      )}
      {!m &&
        graph.nodes
          .filter((n) => n.covered && n.id !== 'SG')
          .map((n) => <Arc key={n.id} from={project(byId.SG.lat, byId.SG.lon)} to={project(n.lat, n.lon)} color={c.accent} height={1.2} width={1.5} animate={animate} dashed />)}
      <OrbitControls
        enabled={interactive}
        enablePan={false}
        minDistance={6}
        maxDistance={18}
        maxPolarAngle={Math.PI / 2.4}
        autoRotate={animate && !interactive}
        autoRotateSpeed={0.4}
        target={[0, 0, 0]}
      />
    </Canvas>
  )
}
