import { Broadcast, MagnifyingGlass } from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button, Disclaimer, EmptyState, ErrorState, MetaChip, PageHeader, Skeleton, SkeletonList, SourceLink, cx } from '../components/ui'
import { api, COUNTRY_NAMES, type RadarItem } from '../lib/api'
import { useSession } from '../lib/session'

const STAGES = ['announced', 'enacted', 'effective'] as const

export default function RadarPage() {
  const q = useQuery({ queryKey: ['radar'], queryFn: api.radar })
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Regulatory Radar"
        body="Monitored sources and how they changed. Each change is marked as announced, enacted or in effect, and linked to missions it may affect."
      />
      <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
        Prototype: these are sample version histories for two data protection sources, not live monitoring.
      </p>
      {q.isPending ? (
        <SkeletonList rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={<Broadcast size={24} />} title="No monitored sources" body="Sources appear here once they are added to monitoring." />
      ) : (
        <div className="grid gap-6">
          {q.data.items.map((it) => (
            <RadarCard key={it.id} item={it} />
          ))}
        </div>
      )}
      <Disclaimer />
    </div>
  )
}

function RadarCard({ item }: { item: RadarItem }) {
  const { missionId } = useSession()
  const diff = useMutation({ mutationFn: () => api.radarDiff(item.id) })
  const latest = item.versions[item.versions.length - 1]
  return (
    <article className="card grid gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-xs text-muted">{COUNTRY_NAMES[item.country]}</p>
          <h2 className="text-lg font-semibold tracking-tight">{item.record.title}</h2>
          <SourceLink source={item.record} />
        </div>
        <Button variant="ghost" onClick={() => diff.mutate()} disabled={diff.isPending}>
          <MagnifyingGlass size={16} aria-hidden />
          {diff.isPending ? 'Analysing' : 'Analyse latest change'}
        </Button>
      </div>

      {/* Stage track */}
      <ol className="grid grid-cols-3 gap-2" aria-label="Legal stage">
        {STAGES.map((s) => {
          const v = item.versions.find((x) => x.stage === s)
          const current = latest.stage === s
          return (
            <li key={s} className={cx('grid gap-1 rounded-xl border p-3', current ? 'border-brand bg-brand text-on-brand' : v ? 'border-line bg-brand-soft' : 'border-dashed border-line')}>
              <span className="text-sm font-medium capitalize">{s}</span>
              <span className={cx('font-mono text-xs', current ? 'text-on-brand/75' : 'text-muted')}>{v ? v.date : 'Not yet'}</span>
            </li>
          )
        })}
      </ol>

      {diff.isPending && (
        <div className="grid gap-2" role="status" aria-label="Analysing change">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      )}
      {diff.isError && <ErrorState error={diff.error} onRetry={() => diff.mutate()} />}
      {diff.data && (
        <div className="grid gap-5 border-t border-line pt-5 md:grid-cols-2">
          <div className="grid content-start gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-on-accent capitalize">{diff.data.diff.stage_change}</span>
              <MetaChip meta={diff.data.meta} />
            </div>
            <p className="text-sm leading-relaxed">{diff.data.diff.summary}</p>
            <ul className="grid list-disc gap-1.5 pl-5 text-sm">{diff.data.diff.what_changed.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
          <div className="grid content-start gap-3">
            <div className="grid gap-1.5 rounded-xl bg-brand-soft p-4">
              <p className="text-xs font-medium text-muted">Review tasks</p>
              <ul className="grid list-disc gap-1 pl-5 text-sm">{diff.data.diff.review_tasks.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-muted">Missions that may be affected</p>
              {diff.data.affected_missions.length ? (
                <ul className="grid gap-1.5 text-sm">
                  {diff.data.affected_missions.map((m) => (
                    <li key={m.mission_id}>
                      <Link to="/app/passport" className="underline underline-offset-4">
                        {m.objective.slice(0, 70)}
                      </Link>
                      {m.mission_id === missionId && <span className="ml-2 text-xs text-muted">(your active mission)</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No saved passport cites this source yet.</p>
              )}
            </div>
          </div>
          <details className="md:col-span-2">
            <summary className="cursor-pointer text-sm font-medium">Compare source text</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {[diff.data.old, diff.data.new].map((v) => (
                <div key={v.version} className="rounded-xl bg-surface-2 p-4">
                  <p className="mb-1 font-mono text-xs text-muted">
                    Version {v.version}, {v.stage}, {v.date}
                  </p>
                  <p className="text-sm leading-relaxed">{v.text}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </article>
  )
}
