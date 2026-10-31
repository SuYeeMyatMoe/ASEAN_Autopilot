import { ListChecks } from '@phosphor-icons/react'
import { useState } from 'react'
import { RequireMission } from '../components/RequireMission'
import { ButtonLink, Disclaimer, EmptyState, ErrorState, PageHeader, SkeletonList, SourceLink, STATUS, STATUS_ORDER, StatusBadge, cx } from '../components/ui'
import type { Mission, Status } from '../lib/api'
import { usePassport } from '../lib/usePassport'

export default function GapsPage() {
  return <RequireMission>{({ mission }) => <Gaps mission={mission} />}</RequireMission>
}

function Gaps({ mission }: { mission: Mission }) {
  const { query, missing } = usePassport(mission.id)
  const [filter, setFilter] = useState<Status | 'all'>('all')

  if (query.isPending) return <SkeletonList rows={4} />
  if (missing)
    return (
      <EmptyState
        icon={<ListChecks size={24} />}
        title="Generate your passport first"
        body="The gap check compares your profile with the requirements in your Launch Passport."
        action={<ButtonLink to="/app/passport">Go to passport</ButtonLink>}
      />
    )
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const p = query.data
  const applicable = p.items.filter((i) => i.applies)
  const groups = STATUS_ORDER.map((s) => ({ s, items: applicable.filter((i) => i.status === s) })).filter(
    (g) => g.items.length && (filter === 'all' || filter === g.s),
  )

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Regulatory gap check"
        body="Where your current profile stands against each requirement. A gap means something to investigate, not that you are non-compliant."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-6">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${applicable.length})`} />
            {STATUS_ORDER.map((s) =>
              p.status_counts[s] ? <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} label={`${STATUS[s].label} (${p.status_counts[s]})`} /> : null,
            )}
          </div>

          {groups.map(({ s, items }) => (
            <section key={s} className="grid gap-3" aria-labelledby={`g-${s}`}>
              <div className="flex items-center gap-3">
                <StatusBadge status={s} />
                <h2 id={`g-${s}`} className="text-sm text-muted">{STATUS[s].help}</h2>
              </div>
              <div className="card divide-y divide-line">
                {items.map((it) => (
                  <div key={it.record_id} className="grid gap-3 p-5 md:grid-cols-[1.2fr_1fr]">
                    <div className="grid content-start gap-1.5">
                      <p className="font-medium leading-snug">{it.title}</p>
                      <p className="text-xs text-muted">
                        <span className="font-mono">{it.area}</span> {it.area_name}
                      </p>
                      <SourceLink source={{ ...it, id: it.record_id }} />
                    </div>
                    <div className="grid content-start gap-2 text-sm">
                      {it.missing.length > 0 && (
                        <p>
                          <span className="text-muted">Missing: </span>
                          {it.missing.join('; ')}
                        </p>
                      )}
                      <p>
                        <span className="text-muted">Next: </span>
                        {it.next_action}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="grid content-start gap-4">
          <div className="card grid gap-3 p-5">
            <h2 className="font-semibold tracking-tight">Information to provide</h2>
            {p.missing_information.length ? (
              <ul className="grid list-disc gap-1.5 pl-5 text-sm">{p.missing_information.map((m) => <li key={m}>{m}</li>)}</ul>
            ) : (
              <p className="text-sm text-muted">Nothing outstanding.</p>
            )}
          </div>
          <div className="card grid gap-3 bg-brand-soft p-5">
            <h2 className="font-semibold tracking-tight">Recommended next steps</h2>
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm">{p.recommended_next_actions.map((m) => <li key={m}>{m}</li>)}</ol>
            <ButtonLink to="/app/roadmap" variant="brand" className="mt-2 justify-self-start">
              See the roadmap
            </ButtonLink>
          </div>
          <Disclaimer />
        </aside>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx('rounded-full border px-3.5 py-1.5 text-sm', active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface hover:bg-surface-2')}
    >
      {label}
    </button>
  )
}
