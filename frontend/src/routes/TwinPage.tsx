import { Globe, Path } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { ErrorState, PageHeader, Skeleton, StatusBadge, cx } from '../components/ui'
import { api, COUNTRY_NAMES } from '../lib/api'
import { useSession } from '../lib/session'
import TwinScene, { type SatNode } from '../twin/TwinScene'
import { hasWebGL } from '../twin/webgl'

function useThemeAttr() {
  const [t, setT] = useState(document.documentElement.dataset.theme)
  useEffect(() => {
    const obs = new MutationObserver(() => setT(document.documentElement.dataset.theme))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return t
}

export default function TwinPage() {
  const { missionId } = useSession()
  const reduce = useReducedMotion()
  const theme = useThemeAttr()
  const webgl = useMemo(() => hasWebGL(), [])
  const [missionMode, setMissionMode] = useState(true)
  const q = useQuery({ queryKey: ['twin', missionId], queryFn: () => api.twin(missionId) })
  const [selected, setSelected] = useState<string | null>(null)

  const mission = missionMode ? q.data?.mission ?? null : null
  const sats: SatNode[] = useMemo(
    () => (mission ? mission.legs.filter((l) => l.stage === 'Authorities' || l.stage === 'Partners and funding').flatMap((l) => l.items.map((i) => ({ id: i.id, label: i.label, stage: l.stage }))) : []),
    [mission],
  )
  const focus = selected ?? mission?.target ?? null
  const node = q.data?.nodes.find((n) => n.id === focus)

  return (
    <div className="grid gap-6">
      <PageHeader
        title="ASEAN Ecosystem Twin"
        body="Every ASEAN market as a hub. Taller hubs have more sourced requirements, agencies and opportunities. Mission Mode traces your route into the target market."
        actions={
          q.data?.mission && (
            <button
              onClick={() => setMissionMode(!missionMode)}
              aria-pressed={missionMode}
              className={cx('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm', missionMode ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface')}
            >
              <Path size={16} aria-hidden />
              Mission Mode {missionMode ? 'on' : 'off'}
            </button>
          )
        }
      />
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card relative h-[420px] min-w-0 overflow-hidden md:h-[600px]">
          {q.isPending ? (
            <Skeleton className="absolute inset-0 rounded-none" />
          ) : !webgl ? (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-muted">
              <div className="grid gap-2">
                <Globe size={32} className="mx-auto" aria-hidden />
                3D view needs WebGL, which this browser has turned off. The mission route is listed alongside.
              </div>
            </div>
          ) : q.data ? (
            <TwinScene
              key={theme}
              graph={{ nodes: q.data.nodes, mission }}
              selected={focus}
              onSelect={setSelected}
              satellites={sats}
              animate={!reduce}
            />
          ) : null}
          <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-muted">Drag to orbit. Scroll to zoom. Select a hub for details.</p>
        </div>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-4">
          {node && (
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
            </div>
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
            <div className="card grid gap-2 p-5 text-sm text-muted">
              {missionId ? 'Mission Mode is off. Turn it on to trace your route.' : 'Set a mission to trace your route from home market to target market.'}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
