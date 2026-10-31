import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { useEffect, useState } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'

/** ISO 3166 numeric ids used by world-atlas, mapped to our alpha-2 codes. */
export const ASEAN_NUMERIC: Record<string, string> = {
  '096': 'BN',
  '104': 'MM',
  '116': 'KH',
  '360': 'ID',
  '418': 'LA',
  '458': 'MY',
  '608': 'PH',
  '626': 'TL',
  '702': 'SG',
  '704': 'VN',
  '764': 'TH',
}

export type CountryFeature = Feature<Geometry, { name: string }> & { id?: string | number }

export const asean = (f: CountryFeature) => ASEAN_NUMERIC[String(f.id).padStart(3, '0')]

let cache: Promise<CountryFeature[]> | null = null

/**
 * World countries at 1:110m for context, with the 11 ASEAN members swapped for
 * 1:50m outlines (Singapore and Brunei only exist at that resolution).
 * Keeps the globe light enough for laptops without a strong GPU. Lazy, cached.
 */
export function loadCountries(): Promise<CountryFeature[]> {
  cache ??= Promise.all([import('world-atlas/countries-110m.json'), import('./asean-50m.json')]).then(([w, a]) => {
    const topo = (w.default ?? w) as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
    const world = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features as CountryFeature[]
    const detailed = ((a.default ?? a) as unknown as FeatureCollection<Geometry, { name: string }>).features as CountryFeature[]
    return [...world.filter((f) => !asean(f)), ...detailed]
  })
  return cache
}

export function useCountries() {
  const [features, setFeatures] = useState<CountryFeature[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    loadCountries()
      .then((f) => live && setFeatures(f))
      .catch(() => live && setError(true))
    return () => {
      live = false
    }
  }, [])
  return { features, error }
}

/** Reads design tokens so WebGL / SVG colours follow the active theme. */
export function readTokens() {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return {
    bg: v('--bg'),
    surface: v('--surface'),
    surface2: v('--surface-2'),
    ink: v('--ink'),
    muted: v('--muted'),
    line: v('--line'),
    brand: v('--brand'),
    brandDeep: v('--brand-deep'),
    brandSoft: v('--brand-soft'),
    accent: v('--accent'),
    onAccent: v('--on-accent'),
  }
}

export function useThemeAttr() {
  const [t, setT] = useState(document.documentElement.dataset.theme)
  useEffect(() => {
    const obs = new MutationObserver(() => setT(document.documentElement.dataset.theme))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return t
}

export const PIN_KINDS = {
  agency: { label: 'Government agency', color: 'var(--st-review)' },
  programme: { label: 'Programme', color: 'var(--st-available)' },
  funding: { label: 'Funding', color: 'var(--st-action)' },
  partner: { label: 'Partner', color: 'var(--pin-partner)' },
  talent: { label: 'Talent', color: 'var(--st-missing)' },
} as const
export type PinKind = keyof typeof PIN_KINDS
