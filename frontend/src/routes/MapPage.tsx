import { ArrowSquareOut, Globe as GlobeIcon, MapTrifold, Path, X } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'motion/react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { ErrorState, PageHeader, Skeleton, StatusBadge, cx } from '../components/ui'
import { PIN_KINDS, useCountries, type PinKind } from '../geo/asean'
import type { Cluster } from '../geo/GlobeView'
import { hasWebGL } from '../geo/webgl'
import { api, COUNTRY_NAMES } from '../lib/api'
import { useSession } from '../lib/session'

const GlobeView = lazy(() => import('../geo/GlobeView'))
const MapView = lazy(() => import('../geo/MapView'))

type Mode = 'globe' | 'map'

function loadMode(): Mode {
  try {
    return localStorage.getItem('amc-map-mode') === 'map' ? 'map' : 'globe'
  } catch {
    return 'globe'
  }
}

export default function MapPage() {
  const { missionId } = useSession()
  const reduce = !!useReducedMotion()
  const webgl = useMemo(() => hasWebGL(), [])
  const [mode, setModeState] = useState<Mode>(() => (webgl ? loadMode() : 'map'))
  const [missionMode, setMissionMode] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [cluster, setCluster] = useState<Cluster | null>(null)
  const q = useQuery({ queryKey: ['twin', missionId], queryFn: () => api.twin(missionId) })
  const geo = useCountries()

  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem('amc-map-mode', m)
    } catch {
      /* storage unavailable */
    }
  }

  const mission = missionMode ? q.data?.mission ?? null : null
  const focus = selected ?? mission?.target ?? null
  const node = q.data?.nodes.find((n) => n.id === focus)
  const countryPins = q.data?.pins.filter((p) => p.country === focus) ?? []

  const selectCountry = (code: string | null) => {
    setSelected(code)
    setCluster(null)
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="ASEAN Ecosystem Map"
        body="Every ASEAN member state on a globe or a map. Pins mark government agencies, programmes, funding, partners and talent. Mission Mode draws your route into the target market."
        actions={
          <>
            <div role="radiogroup" aria-label="View" className="inline-flex rounded-full border border-line bg-surface p-1">
              {(
                [
                  ['globe', 'Globe', GlobeIcon],
                  ['map', 'Map', MapTrifold],
                ] as const
              ).map(([m, label, Icon]) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  disabled={m === 'globe' && !webgl}
                  onClick={() => setMode(m)}
                  className={cx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition', mode === m ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink disabled:opacity-40')}
                >
                  <Icon size={16} aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            {q.data?.mission && (
              <button
                onClick={() => setMissionMode(!missionMode)}
                aria-pressed={missionMode}
                className={cx('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm', missionMode ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface')}
              >
                <Path size={16} aria-hidden />
                Mission Mode {missionMode ? 'on' : 'off'}
              </button>
            )}
          </>
        }
      />
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {geo.error && <ErrorState error={new Error('The map outlines could not be loaded. Reload the page to try again.')} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={cx('card relative h-[440px] min-w-0 overflow-hidden md:h-[620px]', mode === 'globe' && 'border-transparent bg-brand')}>
          {q.isPending || !geo.features ? (
            <Skeleton className="absolute inset-0 rounded-none" />
          ) : q.data ? (
            <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
              {mode === 'globe' ? (
                <GlobeView
                  graph={{ nodes: q.data.nodes, pins: q.data.pins, mission }}
                  features={geo.features}
                  selected={focus}
                  onSelectCountry={selectCountry}
                  onSelectCluster={setCluster}
                  reduceMotion={reduce}
                />
              ) : (
                <MapView
                  graph={{ nodes: q.data.nodes, pins: q.data.pins, mission }}
                  features={geo.features}
                  selected={selected}
                  onSelectCountry={selectCountry}
                  onSelectCluster={setCluster}
                  activeCluster={cluster?.key ?? null}
                  reduceMotion={reduce}
                />
              )}
            </Suspense>
          ) : null}

          <ul className={cx('pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-[11px]', mode === 'globe' ? 'bg-brand-deep/80 text-on-brand' : 'bg-surface/90 text-ink')} aria-label="Pin legend">
            {(Object.keys(PIN_KINDS) as PinKind[]).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border-2 bg-surface" style={{ borderColor: PIN_KINDS[k].color }} aria-hidden />
                {PIN_KINDS[k].label}
              </li>
            ))}
          </ul>
        </div>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-4">
          {cluster ? (
            <div className="card grid grid-cols-1 gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{cluster.city}</h2>
                  <p className="text-xs text-muted">{COUNTRY_NAMES[cluster.country]}</p>
                </div>
                <button onClick={() => setCluster(null)} aria-label="Close city details" className="rounded-full p-1.5 hover:bg-surface-2">
                  <X size={16} />
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-2">
                {cluster.pins.map((p) => (
                  <PinRow key={p.id} pin={p} />
                ))}
              </ul>
            </div>
          ) : node ? (
            <div className="card grid grid-cols-1 gap-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{node.label}</h2>
                <span className="text-xs text-muted">{node.covered ? 'Sources available' : 'Coming soon'}</span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ['Requirements', node.counts.records],
                    ['Agencies', node.counts.agencies],
                    ['Resources', node.counts.opportunities],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-surface-2 p-2">
                    <dd className="font-mono text-lg">{v}</dd>
                    <dt className="text-[11px] text-muted">{k}</dt>
                  </div>
                ))}
              </dl>
              {countryPins.length > 0 && (
                <ul className="grid grid-cols-1 gap-2 border-t border-line pt-3">
                  {countryPins.slice(0, 6).map((p) => (
                    <PinRow key={p.id} pin={p} />
                  ))}
                  {countryPins.length > 6 && <li className="text-xs text-muted">and {countryPins.length - 6} more on the map</li>}
                </ul>
              )}
            </div>
          ) : (
            <div className="card p-5 text-sm text-muted">Select a country or a numbered pin to see what is there.</div>
          )}

          {mission ? (
            <div className="card grid grid-cols-1 gap-4 p-5">
              <h2 className="font-semibold tracking-tight">
                {COUNTRY_NAMES[mission.origin]} to {COUNTRY_NAMES[mission.target]}
              </h2>
              <ol className="relative grid grid-cols-1 gap-4 border-l-2 border-line pl-5">
                {mission.legs.map((leg) => (
                  <li key={leg.stage} className="relative grid grid-cols-1 gap-1.5">
                    <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-bg bg-accent" aria-hidden />
                    <p className="text-sm font-medium">
                      {leg.stage} <span className="font-mono text-xs text-muted">{leg.items.length}</span>
                    </p>
                    <ul className="grid grid-cols-1 gap-1">
                      {leg.items.slice(0, 4).map((it) => (
                        <li key={it.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate">{it.label}</span>
                          {it.status && <StatusBadge status={it.status} compact />}
                        </li>
                      ))}
                      {leg.items.length > 4 && <li className="text-xs text-muted">and {leg.items.length - 4} more</li>}
                      {leg.items.length === 0 && <li className="text-xs text-muted">Generate the passport to fill this leg</li>}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="card p-5 text-sm text-muted">
              {missionId ? 'Mission Mode is off. Turn it on to draw your route.' : 'Set a mission to draw your route from home market to target market.'}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function PinRow({ pin }: { pin: import('../lib/api').MapPin }) {
  const kind = PIN_KINDS[pin.kind]
  return (
    <li className="grid gap-0.5 rounded-xl bg-surface-2 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
        <span className="size-2 rounded-full" style={{ background: kind.color }} aria-hidden />
        {kind.label}
        {pin.sample && <span className="rounded-full border border-line px-1.5">Illustrative</span>}
      </span>
      <span className="flex items-start justify-between gap-2 text-sm font-medium">
        <span className="min-w-0">{pin.label}</span>
        {pin.url && (
          <a href={pin.url} target="_blank" rel="noreferrer" aria-label={`${pin.label} official site`} className="shrink-0 rounded-full p-0.5 hover:bg-line">
            <ArrowSquareOut size={14} />
          </a>
        )}
      </span>
    </li>
  )
}
