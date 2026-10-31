import { MapPin as MapPinIcon } from '@phosphor-icons/react'
import { geoMercator, geoPath } from 'd3-geo'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapPin, TwinGraph } from '../lib/api'
import { asean, PIN_KINDS, type CountryFeature } from './asean'
import { clusterPins, type Cluster } from './GlobeView'

/* ASEAN bounding box (lon/lat) used to frame the default view. */
const ASEAN_BOX = {
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'MultiPoint' as const, coordinates: [[92, -11.5], [127.5, 28.5]] },
}

/* Country pins on the flat map sit inland, away from the city clusters at the capitals. */
const PIN_POS: Record<string, [number, number]> = { ID: [113.8, -0.6], MY: [102.2, 4.6], PH: [122.5, 12.5] }

export default function MapView({
  graph,
  features,
  selected,
  onSelectCountry,
  onSelectCluster,
  activeCluster,
  reduceMotion = false,
}: {
  graph: Pick<TwinGraph, 'nodes' | 'mission'> & { pins: MapPin[] }
  features: CountryFeature[]
  selected: string | null
  onSelectCountry: (code: string | null) => void
  onSelectCluster: (c: Cluster) => void
  activeCluster: string | null
  reduceMotion?: boolean
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 560 })
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { path, project } = useMemo(() => {
    const proj = geoMercator().fitExtent(
      [
        [24, 24],
        [size.w - 24, size.h - 24],
      ],
      ASEAN_BOX,
    )
    return { path: geoPath(proj), project: (lon: number, lat: number) => proj([lon, lat]) ?? [0, 0] }
  }, [size])

  const visible = useMemo(
    () => features.filter((f) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f)
      return x1 > -200 && x0 < size.w + 200 && y1 > -200 && y0 < size.h + 200
    }),
    [features, path, size],
  )

  const nodes = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph.nodes])
  const clusters = useMemo(() => clusterPins(graph.pins), [graph.pins])

  // Zoom: fit the selected country's bounds; pins and labels counter-scale to stay readable.
  const view = useMemo(() => {
    const f = selected ? visible.find((x) => asean(x) === selected) : null
    if (!f) return { k: 1, x: 0, y: 0 }
    const [[x0, y0], [x1, y1]] = path.bounds(f)
    const k = Math.min(6, 0.8 / Math.max((x1 - x0) / size.w, (y1 - y0) / size.h))
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    return { k: Math.max(1, k), x: size.w / 2 - cx * Math.max(1, k), y: size.h / 2 - cy * Math.max(1, k) }
  }, [selected, visible, path, size])

  const m = graph.mission
  const arc = useMemo(() => {
    if (!m || !nodes[m.origin] || !nodes[m.target]) return null
    const [x0, y0] = project(...(PIN_POS[m.origin] ?? [nodes[m.origin].lon, nodes[m.origin].lat]))
    const [x1, y1] = project(...(PIN_POS[m.target] ?? [nodes[m.target].lon, nodes[m.target].lat]))
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.35
    return `M${x0},${y0} Q${mx},${my} ${x1},${y1}`
  }, [m, nodes, project])

  const s = 1 / view.k

  return (
    <div ref={wrap} className="absolute inset-0 select-none" style={{ background: 'var(--surface-2)' }}>
      <svg width={size.w} height={size.h} role="img" aria-label="Map of ASEAN member states with ecosystem pins">
        <motion.g
          initial={false}
          animate={{ x: view.x, y: view.y, scale: view.k }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
          style={{ originX: 0, originY: 0 }}
        >
          <rect x={-5000} y={-5000} width={10000} height={10000} fill="transparent" onClick={() => onSelectCountry(null)} />
          {visible.map((f, i) => {
            const code = asean(f)
            const covered = code && nodes[code]?.covered
            const fill = !code ? 'var(--line)' : code === selected ? 'var(--brand)' : covered ? 'var(--accent)' : 'var(--brand-soft)'
            return (
              <path
                key={`${f.id ?? "x"}-${i}`}
                d={path(f) ?? undefined}
                fill={fill}
                stroke="var(--surface)"
                strokeWidth={0.8 * s}
                className={code ? 'cursor-pointer transition-[fill] duration-300 hover:opacity-85' : undefined}
                onClick={code ? (e) => (e.stopPropagation(), onSelectCountry(code === selected ? null : code)) : undefined}
              >
                {code && <title>{nodes[code]?.label ?? f.properties.name}</title>}
              </path>
            )
          })}

          {arc && (
            <path
              d={arc}
              fill="none"
              stroke="var(--route)"
              strokeWidth={2.5 * s}
              strokeDasharray={`${8 * s} ${6 * s}`}
              strokeLinecap="round"
              className={reduceMotion ? undefined : 'amc-dash'}
              style={{ ['--dash' as string]: `${-28 * s}` }}
            />
          )}

          {/* Country pins */}
          {graph.nodes.map((n) => {
            const [x, y] = project(...(PIN_POS[n.id] ?? [n.lon, n.lat]))
            const active = n.id === selected || n.id === m?.target || n.id === m?.origin
            return (
              <g key={n.id} transform={`translate(${x},${y}) scale(${s})`} className="cursor-pointer" onClick={() => onSelectCountry(n.id === selected ? null : n.id)}>
                <MapPinIcon x={-14} y={-28} size={28} weight="fill" color={n.covered ? '#0f3d2e' : active ? 'var(--route)' : 'var(--muted)'} aria-hidden />
                <text x={12} y={-12} fontSize={12} fontWeight={active ? 600 : 500} fill="var(--ink)" paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={3}>
                  {n.label}
                </text>
              </g>
            )
          })}

          {/* Ecosystem clusters */}
          {clusters.map((c) => {
            const [x, y] = project(c.lon + 0.35, c.lat - 0.35)
            const kinds = [...new Set(c.pins.map((p) => p.kind))]
            const on = activeCluster === c.key
            return (
              <g
                key={c.key}
                transform={`translate(${x},${y}) scale(${s})`}
                role="button"
                tabIndex={0}
                aria-label={`${c.city}: ${c.pins.length} ecosystem entries`}
                className="cursor-pointer focus:outline-none"
                onClick={(e) => (e.stopPropagation(), onSelectCluster(c))}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectCluster(c)}
              >
                <circle r={on ? 13 : 11} fill="var(--surface)" stroke={PIN_KINDS[kinds[0]].color} strokeWidth={on ? 3 : 2} />
                <text textAnchor="middle" dy={4} fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink)">
                  {c.pins.length}
                </text>
              </g>
            )
          })}
        </motion.g>
      </svg>
    </div>
  )
}
