import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { MeshPhongMaterial } from 'three'
import type { MapPin, TwinGraph, TwinNode } from '../lib/api'
import { asean, PIN_KINDS, type CountryFeature, type PinKind } from './asean'

/* The globe sits on a brand-green panel in both themes, so it uses fixed brand colours. */
const C = {
  ocean: '#0f3d2e',
  land: '#245a46',
  asean: '#a9c9b3',
  covered: '#c6f05a',
  stroke: '#0a2a20',
  arc: '#c6f05a',
}

/* Label side per country, chosen so neighbouring labels don't collide around the Malacca Strait. */
const LABEL_DIR: Record<string, 'left' | 'right' | 'below' | 'above'> = {
  MM: 'left', TH: 'left', MY: 'left', SG: 'below', ID: 'below', LA: 'above', VN: 'right', KH: 'right', PH: 'right', BN: 'right', TL: 'right',
}

export interface Cluster {
  key: string
  city: string
  country: string
  lat: number
  lon: number
  pins: MapPin[]
}

export function clusterPins(pins: MapPin[]): Cluster[] {
  const map = new Map<string, Cluster>()
  for (const p of pins) {
    const key = `${p.city}-${p.country}`
    const c = map.get(key) ?? { key, city: p.city, country: p.country, lat: p.lat, lon: p.lon, pins: [] }
    c.pins.push(p)
    map.set(key, c)
  }
  return [...map.values()]
}

type Html =
  | { type: 'country'; node: TwinNode; active: boolean; lat: number; lng: number }
  | { type: 'cluster'; cluster: Cluster; lat: number; lng: number }

export default function GlobeView({
  graph,
  features,
  selected,
  onSelectCountry,
  onSelectCluster,
  interactive = true,
  autoRotate = false,
  showClusters = true,
  reduceMotion = false,
}: {
  graph: Pick<TwinGraph, 'nodes' | 'mission'> & { pins?: MapPin[] }
  features: CountryFeature[]
  selected?: string | null
  onSelectCountry?: (code: string) => void
  onSelectCluster?: (c: Cluster) => void
  interactive?: boolean
  autoRotate?: boolean
  showClusters?: boolean
  reduceMotion?: boolean
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const globe = useRef<GlobeMethods | undefined>(undefined)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const handlers = useRef({ onSelectCountry, onSelectCluster })
  useLayoutEffect(() => {
    handlers.current = { onSelectCountry, onSelectCluster }
  })

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const material = useMemo(() => new MeshPhongMaterial({ color: C.ocean, shininess: 6 }), [])
  const nodes = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph.nodes])
  const m = graph.mission

  const html: Html[] = useMemo(() => {
    const countries: Html[] = graph.nodes.map((n) => ({ type: 'country', node: n, active: n.id === selected, lat: n.lat, lng: n.lon }))
    const clusters: Html[] = showClusters
      ? clusterPins(graph.pins ?? []).map((c) => ({ type: 'cluster', cluster: c, lat: c.lat - 0.9, lng: c.lon + 0.9 }))
      : []
    return [...countries, ...clusters]
  }, [graph.nodes, graph.pins, showClusters, selected])

  const arcs = useMemo(() => {
    if (!m || !nodes[m.origin] || !nodes[m.target]) return []
    const o = nodes[m.origin]
    const t = nodes[m.target]
    const main = [{ startLat: o.lat, startLng: o.lon, endLat: t.lat, endLng: t.lon, main: true }]
    const local = clusterPins((graph.pins ?? []).filter((p) => p.country === m.target))
      .filter((c) => Math.abs(c.lat - t.lat) + Math.abs(c.lon - t.lon) > 0.3)
      .map((c) => ({ startLat: t.lat, startLng: t.lon, endLat: c.lat, endLng: c.lon, main: false }))
    return [...main, ...local]
  }, [m, nodes, graph.pins])

  const rings = useMemo(() => (m && nodes[m.target] ? [{ lat: nodes[m.target].lat, lng: nodes[m.target].lon }] : []), [m, nodes])

  const onReady = () => {
    const g = globe.current
    if (!g) return
    g.pointOfView({ lat: 6, lng: 112, altitude: interactive ? 1.55 : 1.35 }, 0)
    const controls = g.controls()
    controls.enableZoom = interactive
    controls.enablePan = false
    controls.minDistance = 160
    controls.maxDistance = 520
    controls.autoRotate = autoRotate && !reduceMotion
    controls.autoRotateSpeed = 0.35
  }

  // Fly to a selected country.
  useEffect(() => {
    const n = selected ? nodes[selected] : null
    if (n && globe.current && interactive) globe.current.pointOfView({ lat: n.lat, lng: n.lon, altitude: 1.1 }, reduceMotion ? 0 : 1200)
  }, [selected, nodes, interactive, reduceMotion])

  const makeElement = (d: object) => {
    const h = d as Html
    const el = document.createElement('button')
    el.type = 'button'
    el.style.pointerEvents = interactive ? 'auto' : 'none'
    if (h.type === 'country') {
      const n = h.node
      el.className = `amc-pin amc-pin--country dir-${LABEL_DIR[n.id] ?? 'right'}` + (n.covered ? ' is-covered' : '') + (h.active ? ' is-selected' : '')
      el.setAttribute('aria-label', `${n.label}${n.covered ? ', sources available' : ', coming soon'}`)
      el.innerHTML = `<span class="amc-pin__dot"></span><span class="amc-pin__label"></span>`
      el.querySelector('.amc-pin__label')!.textContent = n.label
      el.onclick = () => handlers.current.onSelectCountry?.(n.id)
    } else {
      const c = h.cluster
      const kinds = [...new Set(c.pins.map((p) => p.kind))] as PinKind[]
      el.className = 'amc-pin amc-pin--cluster'
      el.style.setProperty('--pin', PIN_KINDS[kinds[0]].color)
      el.setAttribute('aria-label', `${c.city}: ${c.pins.length} ecosystem ${c.pins.length === 1 ? 'entry' : 'entries'}`)
      el.textContent = String(c.pins.length)
      el.onclick = () => handlers.current.onSelectCluster?.(c)
    }
    return el
  }

  return (
    <div ref={wrap} className="absolute inset-0">
      {size.w > 0 && (
        <Globe
          ref={globe}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={material}
          showAtmosphere
          atmosphereColor={C.covered}
          atmosphereAltitude={0.14}
          onGlobeReady={onReady}
          polygonsData={features}
          polygonCapColor={(f) => {
            const code = asean(f as CountryFeature)
            if (!code) return C.land
            return nodes[code]?.covered ? C.covered : C.asean
          }}
          polygonSideColor={() => 'rgba(10,42,32,0.6)'}
          polygonStrokeColor={() => C.stroke}
          polygonAltitude={(f) => {
            const code = asean(f as CountryFeature)
            return code === selected ? 0.03 : code ? 0.012 : 0.004
          }}
          polygonsTransitionDuration={reduceMotion ? 0 : 400}
          onPolygonClick={(f) => {
            const code = asean(f as CountryFeature)
            if (code && interactive) handlers.current.onSelectCountry?.(code)
          }}
          htmlElementsData={html}
          htmlElement={makeElement}
          htmlAltitude={(d) => ((d as Html).type === 'country' ? 0.04 : 0.02)}
          arcsData={arcs}
          arcColor={() => C.arc}
          arcStroke={(a) => ((a as { main: boolean }).main ? 0.9 : 0.35)}
          arcAltitudeAutoScale={0.35}
          arcDashLength={0.45}
          arcDashGap={0.15}
          arcDashAnimateTime={reduceMotion ? 0 : 2200}
          ringsData={reduceMotion ? [] : rings}
          ringColor={() => (t: number) => `rgba(198,240,90,${1 - t})`}
          ringMaxRadius={4}
          ringPropagationSpeed={2}
          ringRepeatPeriod={1400}
        />
      )}
    </div>
  )
}
