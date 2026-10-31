import { CaretDown, CheckCircle, Circle, ListChecks, Lock } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RequireMission } from '../components/RequireMission'
import { ButtonLink, Disclaimer, EmptyState, ErrorState, PageHeader, SkeletonList, SourceLink, STATUS, STATUS_ORDER, StatusBadge, cx } from '../components/ui'
import { api, type Mission, type PassportItem, type RoadmapStep, type Status } from '../lib/api'
import { usePassport } from '../lib/usePassport'

const DONE_KIND = 'roadmap_step_completed'
type View = 'order' | 'status'

export default function PlanPage() {
  return <RequireMission>{({ mission }) => <Plan mission={mission} />}</RequireMission>
}

function Plan({ mission }: { mission: Mission }) {
  const qc = useQueryClient()
  const { query, missing } = usePassport(mission.id)
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'status' ? 'status' : 'order'
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const roadmap = useQuery({ queryKey: ['roadmap', mission.id], queryFn: () => api.roadmap(mission.id), retry: false })
  const ms = useQuery({ queryKey: ['milestones', mission.id], queryFn: () => api.milestones(mission.id) })

  const toggleDone = useMutation({
    mutationFn: async ({ item, milestoneId }: { item: PassportItem; milestoneId?: string }) => {
      if (milestoneId) {
        await api.removeMilestone(milestoneId)
        return
      }
      await api.addMilestone({ mission_id: mission.id, kind: DONE_KIND, label: `Plan: ${item.title}`, ref_id: item.record_id })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones', mission.id] }),
  })

  if (query.isPending || roadmap.isPending) return <SkeletonList rows={4} />
  if (missing)
    return (
      <EmptyState
        icon={<ListChecks size={24} />}
        title="Generate your passport first"
        body="The launch plan turns your passport requirements into an ordered checklist and shows what is still missing."
        action={<ButtonLink to="/app/passport">Go to passport</ButtonLink>}
      />
    )
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (roadmap.isError) return <ErrorState error={roadmap.error} onRetry={() => roadmap.refetch()} />

  const p = query.data
  const stages = roadmap.data?.stages ?? []
  const items = p.items.filter((i) => i.applies)
  const byRecord = new Map(items.map((i) => [i.record_id, i]))
  const steps = stages.flatMap((s) => s.steps)
  const stepByRecord = new Map(steps.map((s) => [s.record_id, s]))
  const titles = new Map(steps.map((s) => [s.record_id, s.title] as const))

  const doneByRecord = new Map<string, string>()
  for (const m of ms.data?.milestones ?? []) {
    if (m.kind === DONE_KIND && m.ref_id && !doneByRecord.has(m.ref_id)) doneByRecord.set(m.ref_id, m.id)
  }

  const doneCount = steps.filter((s) => doneByRecord.has(s.record_id)).length
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0
  const openGaps = items.filter((i) => i.status !== 'information_available')
  const nextStep = steps.find((s) => !doneByRecord.has(s.record_id))
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, items.filter((i) => i.status === s).length])) as Record<Status, number>
  const groups = STATUS_ORDER.map((s) => ({
    s,
    items: items
      .filter((i) => i.status === s)
      .sort((a, b) => a.area.localeCompare(b.area) || a.title.localeCompare(b.title)),
  })).filter((g) => g.items.length && (filter === 'all' || filter === g.s))

  function setView(v: View) {
    setParams(v === 'order' ? {} : { view: 'status' }, { replace: true })
  }

  function toggleOpen(recordId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return next
    })
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Launch plan"
        body="What is still open and the order that unblocks the rest. Check steps off as you go; a gap means something to investigate, not that you are non-compliant."
      />

      <section className="card grid gap-4 p-5" aria-label="Plan summary">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="grid gap-0.5">
              <p className="font-mono text-2xl font-semibold tracking-tight">
                {doneCount}<span className="text-muted">/{steps.length}</span>
              </p>
              <p className="text-xs text-muted">steps done</p>
            </div>
            <div className="grid gap-0.5">
              <p className="font-mono text-2xl font-semibold tracking-tight">{openGaps.length}</p>
              <p className="text-xs text-muted">open gaps</p>
            </div>
            {nextStep ? (
              <p className="text-sm text-muted">
                Next: <span className="font-medium text-ink">{nextStep.title}</span>
              </p>
            ) : (
              <p className="text-sm font-medium">Every ordered step is done.</p>
            )}
          </div>
          <div role="tablist" aria-label="Plan view" className="flex gap-2">
            <ViewButton active={view === 'order'} onClick={() => setView('order')} label="By order" />
            <ViewButton active={view === 'status'} onClick={() => setView('status')} label="By status" />
          </div>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Steps completed"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-6">
          {view === 'order' ? (
            stages.map((stage, i) => (
              <section key={stage.index} className="grid gap-3" aria-labelledby={`stage-${stage.index}`}>
                <div className="flex items-center gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand font-mono text-xs text-on-brand">{i + 1}</span>
                  <div>
                    <h2 id={`stage-${stage.index}`} className="font-semibold tracking-tight">
                      {stage.label}
                    </h2>
                    <p className="text-xs text-muted">
                      {stage.steps.length} step{stage.steps.length > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <ul className="card divide-y divide-line overflow-hidden">
                  {stage.steps.map((step) => {
                    const item = byRecord.get(step.record_id)
                    if (!item) return null
                    const milestoneId = doneByRecord.get(item.record_id)
                    return (
                      <PlanRow
                        key={step.record_id}
                        item={item}
                        step={step}
                        done={!!milestoneId}
                        busy={toggleDone.isPending}
                        onToggle={() => toggleDone.mutate({ item, milestoneId })}
                        open={expanded.has(item.record_id)}
                        onToggleOpen={() => toggleOpen(item.record_id)}
                        titles={titles}
                      />
                    )
                  })}
                </ul>
              </section>
            ))
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${items.length})`} />
                {STATUS_ORDER.map((s) =>
                  counts[s] ? <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} label={`${STATUS[s].label} (${counts[s]})`} /> : null,
                )}
              </div>

              {openGaps.length === 0 && (
                <div className="card flex items-start gap-3 p-5">
                  <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-brand dark:text-accent" aria-hidden />
                  <div className="grid gap-1">
                    <p className="font-medium">All clear for now</p>
                    <p className="text-sm text-muted">Re-run the gap check when your product, team or target market changes.</p>
                  </div>
                </div>
              )}

              {groups.map(({ s, items: groupItems }) => (
                <section key={s} className="grid gap-3" aria-labelledby={`g-${s}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={s} />
                    <h2 id={`g-${s}`} className="text-sm text-muted">
                      {STATUS[s].help} <span className="font-mono">({groupItems.length})</span>
                    </h2>
                  </div>
                  <ul className="card divide-y divide-line overflow-hidden">
                    {groupItems.map((item) => {
                      const step = stepByRecord.get(item.record_id)
                      const milestoneId = doneByRecord.get(item.record_id)
                      return (
                        <PlanRow
                          key={item.record_id}
                          item={item}
                          step={step}
                          done={!!milestoneId}
                          busy={toggleDone.isPending}
                          onToggle={step ? () => toggleDone.mutate({ item, milestoneId }) : undefined}
                          open={expanded.has(item.record_id)}
                          onToggleOpen={() => toggleOpen(item.record_id)}
                          titles={titles}
                        />
                      )
                    })}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <div className="card grid gap-3 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold tracking-tight">Information to provide</h2>
              {p.missing_information.length > 0 && <span className="font-mono text-xs text-muted">{p.missing_information.length}</span>}
            </div>
            {p.missing_information.length ? (
              <ul className="grid gap-1.5 text-sm">
                {p.missing_information.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand dark:bg-accent" aria-hidden />
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing outstanding.</p>
            )}
          </div>
          <div className="card grid gap-3 bg-brand-soft p-5">
            <h2 className="font-semibold tracking-tight">Recommended next steps</h2>
            <ol className="grid gap-2 text-sm">
              {p.recommended_next_actions.map((m, i) => (
                <li key={m} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand font-mono text-[11px] text-on-brand">{i + 1}</span>
                  {m}
                </li>
              ))}
            </ol>
            <ButtonLink to="/app/passport" variant="ghost" className="mt-1 justify-self-start">
              Review passport
            </ButtonLink>
          </div>
          <Disclaimer />
        </aside>
      </div>
    </div>
  )
}

function PlanRow({
  item,
  step,
  done,
  busy,
  onToggle,
  open,
  onToggleOpen,
  titles,
}: {
  item: PassportItem
  step?: RoadmapStep
  done: boolean
  busy: boolean
  onToggle?: () => void
  open: boolean
  onToggleOpen: () => void
  titles: Map<string, string>
}) {
  const id = `plan-${item.record_id}`
  return (
    <li>
      <div className="flex items-center gap-1 pr-3">
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            aria-pressed={done}
            aria-label={done ? `Mark "${item.title}" as not done` : `Mark "${item.title}" as done`}
            className={cx(
              'ml-3 shrink-0 rounded-full p-1 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50',
              done ? 'text-brand dark:text-accent' : 'text-muted',
            )}
          >
            {done ? <CheckCircle size={20} weight="fill" aria-hidden /> : <Circle size={20} aria-hidden />}
          </button>
        )}
        <button onClick={onToggleOpen} aria-expanded={open} aria-controls={id} className="flex flex-1 items-center gap-3 py-3.5 text-left">
          <span className="grid flex-1 gap-1">
            <span className={cx('text-sm font-medium leading-snug', done && 'line-through decoration-muted/60')}>{item.title}</span>
            <span className="text-xs text-muted">
              <span className="font-mono">{item.area}</span> {item.area_name}
            </span>
          </span>
          {item.missing.length > 0 && (
            <span className="hidden shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted sm:inline">{item.missing.length} to find</span>
          )}
          <CaretDown size={16} aria-hidden className={cx('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div id={id} className="grid gap-3 border-t border-line px-4 py-4">
          <p className="text-sm leading-relaxed text-muted">{item.why_it_applies}</p>
          {item.missing.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-muted">Still to find out</p>
              <ul className="grid gap-1.5 text-sm">
                {item.missing.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand dark:bg-accent" aria-hidden />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-xl bg-brand-soft px-4 py-3">
            <p className="text-xs font-medium text-muted">Next step</p>
            <p className="text-sm font-medium">{item.next_action}</p>
          </div>
          {step && step.waits_for.length > 0 && (
            <p className="text-xs text-muted">
              <span className="text-muted">Waits for: </span>
              {step.waits_for.map((w) => titles.get(w) ?? w).join('; ')}
            </p>
          )}
          {step?.depends_on_structure && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--st-action)' }}>
              <Lock size={12} weight="bold" aria-hidden />
              Depends on your final operating structure
            </p>
          )}
          <SourceLink source={{ ...item, id: item.record_id }} />
        </div>
      )}
    </li>
  )
}

function ViewButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx('rounded-full border px-3.5 py-1.5 text-sm transition', active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface hover:bg-surface-2')}
    >
      {label}
    </button>
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
