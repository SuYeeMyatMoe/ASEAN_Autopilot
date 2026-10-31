import { GitBranch, Lock } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { RequireMission } from '../components/RequireMission'
import { ButtonLink, Disclaimer, EmptyState, ErrorState, PageHeader, SkeletonList, StatusBadge } from '../components/ui'
import { api, ApiError, type Mission } from '../lib/api'

export default function RoadmapPage() {
  return <RequireMission>{({ mission }) => <Roadmap mission={mission} />}</RequireMission>
}

function Roadmap({ mission }: { mission: Mission }) {
  const reduce = useReducedMotion()
  const q = useQuery({ queryKey: ['roadmap', mission.id], queryFn: () => api.roadmap(mission.id), retry: false })

  if (q.isPending) return <SkeletonList rows={3} />
  if (q.error instanceof ApiError && q.error.status === 404)
    return (
      <EmptyState
        icon={<GitBranch size={24} />}
        title="Generate your passport first"
        body="The roadmap orders the requirements in your passport by what each one depends on."
        action={<ButtonLink to="/app/passport">Go to passport</ButtonLink>}
      />
    )
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />

  const titles = new Map(q.data.stages.flatMap((s) => s.steps.map((st) => [st.record_id, st.title] as const)))

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Market-entry roadmap"
        body="Steps ordered by their dependencies in the official sources. Steps in the same column can run at the same time."
      />
      <ol className="relative grid gap-8 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-line md:gap-10">
        {q.data.stages.map((stage, i) => (
          <motion.li
            key={stage.index}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative grid gap-4 md:grid-cols-[220px_1fr]"
          >
            <div className="flex items-start gap-3 md:sticky md:top-24 md:self-start">
              <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-brand font-mono text-sm text-on-brand">{i + 1}</span>
              <div>
                <p className="font-semibold tracking-tight">{stage.label}</p>
                <p className="text-xs text-muted">{stage.steps.length} step{stage.steps.length > 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="grid gap-3 pl-11 sm:grid-cols-2 md:pl-0 xl:grid-cols-3">
            {stage.steps.map((s) => (
              <div key={s.record_id} className="card grid content-start gap-3 p-4">
                <StatusBadge status={s.status} />
                <p className="font-medium leading-snug">{s.title}</p>
                <p className="text-sm text-muted">{s.next_action}</p>
                <p className="text-xs text-muted">{s.authority}</p>
                {(s.waits_for.length > 0 || s.depends_on_structure) && (
                  <div className="grid gap-1.5 border-t border-line pt-3 text-xs">
                    {s.waits_for.length > 0 && (
                      <p>
                        <span className="text-muted">Waits for: </span>
                        {s.waits_for.map((w) => titles.get(w) ?? w).join('; ')}
                      </p>
                    )}
                    {s.depends_on_structure && (
                      <p className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--st-action)' }}>
                        <Lock size={12} weight="bold" aria-hidden />
                        Depends on your final operating structure
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
            </div>
          </motion.li>
        ))}
      </ol>
      <Disclaimer />
    </div>
  )
}
