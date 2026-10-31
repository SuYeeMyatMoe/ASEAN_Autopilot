import { geoMercator, geoPath } from 'd3-geo'
import type { FeatureCollection, Geometry } from 'geojson'
import { useEffect, useMemo, useState } from 'react'

/*
 * Landing hero visual: ASEAN outlines on a dark field, a faint network linking
 * startup hubs, and clusters of glowing dots sized by ecosystem activity.
 * Plain SVG (no WebGL), so the landing page stays light.
 */

const W = 760
const H = 620

/** [lon, lat, weight] for ecosystem hubs. Weight drives cluster size. */
const HUBS: [number, number, number][] = [
  [106.85, -6.21, 10], // Jakarta
  [103.85, 1.29, 9], // Singapore
  [101.69, 3.14, 8], // Kuala Lumpur
  [100.5, 13.75, 8], // Bangkok
  [106.66, 10.76, 7], // Ho Chi Minh City
  [120.98, 14.6, 7], // Manila
  [105.85, 21.03, 6], // Hanoi
  [107.61, -6.92, 4], // Bandung
  [112.75, -7.26, 4], // Surabaya
  [100.33, 5.41, 3], // Penang
  [104.92, 11.56, 3], // Phnom Penh
  [96.16, 16.84, 3], // Yangon
  [123.89, 10.32, 3], // Cebu
  [108.22, 16.05, 3], // Da Nang
  [102.6, 17.97, 2], // Vientiane
  [114.94, 4.94, 2], // Bandar Seri Begawan
  [98.98, 18.79, 2], // Chiang Mai
  [104.05, 1.05, 2], // Batam
  [125.56, -8.56, 2], // Dili
  [115.22, -8.65, 2], // Bali
  [110.42, -7.0, 2], // Semarang
  [116.07, 5.98, 2], // Kota Kinabalu
]

/** Deterministic PRNG so the dots don't jump between renders. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r())

export default function HeroNetworkMap({ animate = true }: { animate?: boolean }) {
  const [geo, setGeo] = useState<FeatureCollection<Geometry> | null>(null)
  useEffect(() => {
    let live = true
    import('./asean-50m.json').then((m) => live && setGeo((m.default ?? m) as unknown as FeatureCollection<Geometry>))
    return () => {
      live = false
    }
  }, [])

  const proj = useMemo(
    () =>
      geoMercator().fitExtent(
        [
          [10, 10],
          [W - 10, H - 10],
        ],
        { type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: [[94, -10], [126, 23]] } },
      ),
    [],
  )
  const path = useMemo(() => geoPath(proj), [proj])
  const { dots, links, pulses, route } = useMemo(() => {
    const pt = (lon: number, lat: number) => proj([lon, lat]) ?? [0, 0]
    const r = rng(20261031)
    const hubs = HUBS.map(([lon, lat, w]) => ({ p: pt(lon, lat), w }))
    const dots: { x: number; y: number; r: number; o: number }[] = []
    for (const h of hubs) {
      const n = h.w * 9
      const spread = 6 + h.w * 2.6
      for (let i = 0; i < n; i++) {
        const d = Math.abs(gauss(r))
        dots.push({
          x: h.p[0] + gauss(r) * spread,
          y: h.p[1] + gauss(r) * spread,
          r: Math.max(1, (3.8 - d) * (0.5 + r() * 0.9)),
          o: 0.35 + r() * 0.6,
        })
      }
    }
    // Ambient sparks across the region.
    for (let i = 0; i < 70; i++) dots.push({ x: 80 + r() * (W - 120), y: 40 + r() * (H - 80), r: 0.8 + r() * 1.4, o: 0.15 + r() * 0.3 })

    // Each hub links to its two nearest neighbours: a light "network" layer.
    const links: [number, number, number, number][] = []
    const seen = new Set<string>()
    hubs.forEach((a, i) => {
      hubs
        .map((b, j) => ({ j, d: Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) }))
        .filter((x) => x.j !== i)
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
        .forEach(({ j }) => {
          const key = [i, j].sort().join('-')
          if (seen.has(key)) return
          seen.add(key)
          links.push([a.p[0], a.p[1], hubs[j].p[0], hubs[j].p[1]])
        })
    })
    const pulses = hubs.filter((h) => h.w >= 6).map((h) => h.p)
    // Mission route: Kuala Lumpur to Jakarta.
    const [kl, jkt] = [pt(101.69, 3.14), pt(106.85, -6.21)]
    const route = `M${kl[0]},${kl[1]} Q${(kl[0] + jkt[0]) / 2 + 40},${(kl[1] + jkt[1]) / 2 - 30} ${jkt[0]},${jkt[1]}`
    return { dots, links, pulses, route }
  }, [proj])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Map of ASEAN startup hubs, with the most active cities glowing brightest">
      <defs>
        <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {geo && (
        <g fill="rgba(198,240,90,0.035)" stroke="rgba(214,235,200,0.22)" strokeWidth={0.7}>
          {geo.features.map((f, i) => (
            <path key={i} d={path(f) ?? undefined} />
          ))}
        </g>
      )}

      <g stroke="rgba(198,240,90,0.16)" strokeWidth={0.8}>
        {links.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>

      {/* Glow pass, then crisp dots on top */}
      <g fill="#7fe07a" filter="url(#hero-glow)" opacity={0.55}>
        {dots.map((d, i) => (d.r > 2 ? <circle key={i} cx={d.x} cy={d.y} r={d.r * 2.2} /> : null))}
      </g>
      <g>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={i % 3 ? '#9ee86a' : '#c6f05a'} opacity={d.o} />
        ))}
      </g>

      <path d={route} fill="none" stroke="#c6f05a" strokeWidth={1.6} strokeDasharray="6 6" className={animate ? 'amc-dash' : undefined} opacity={0.85} />

      {pulses.map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          {animate && <circle r={6} fill="none" stroke="#c6f05a" strokeWidth={1.2} className="amc-ping" style={{ animationDelay: `${i * 0.45}s` }} />}
          <circle r={3.2} fill="#eaffc2" />
        </g>
      ))}
    </svg>
  )
}
