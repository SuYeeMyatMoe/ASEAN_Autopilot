import { ArrowSquareOut, BookmarkSimple, Buildings, Check, Coins, Compass, GraduationCap, RocketLaunch } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { RequireMission } from '../components/RequireMission'
import { EmptyState, ErrorState, MetaChip, PageHeader, SkeletonList, cx } from '../components/ui'
import { api, COUNTRY_NAMES, type EcoItem, type Mission } from '../lib/api'

const KINDS = [
  { id: 'programme', label: 'Programmes', icon: RocketLaunch },
  { id: 'funding', label: 'Funding', icon: Coins },
  { id: 'partner', label: 'Partners', icon: Buildings },
  { id: 'talent', label: 'Talent', icon: GraduationCap },
] as const

export default function DiscoverPage() {
  return <RequireMission>{({ mission }) => <Discover mission={mission} />}</RequireMission>
}

export function Discover({ mission, embedded = false }: { mission: Mission; embedded?: boolean }) {
  const [kinds, setKinds] = useState<string[]>(KINDS.map((k) => k.id))
  const q = useQuery({ queryKey: ['discover', mission.id, kinds], queryFn: () => api.discover(mission.id, kinds), enabled: kinds.length > 0 })

  const toggle = (id: string) => setKinds((ks) => (ks.includes(id) ? ks.filter((k) => k !== id) : [...ks, id]))

  return (
    <div className="grid gap-6">
      {!embedded && (
        <PageHeader
          title="Discover the ecosystem"
          body={`Programmes, funding, partners and talent for your ${COUNTRY_NAMES[mission.target]} mission, ranked by Gemma 4 with a reason for each match.`}
          actions={q.data && <MetaChip meta={q.data.meta} />}
        />
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Resource types">
        {KINDS.map(({ id, label, icon: Icon }) => {
          const on = kinds.includes(id)
          return (
            <button
              key={id}
              aria-pressed={on}
              onClick={() => toggle(id)}
              className={cx('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm', on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface hover:bg-surface-2')}
            >
              <Icon size={16} aria-hidden />
              {label}
            </button>
          )
        })}
      </div>

      {kinds.length === 0 ? (
        <EmptyState icon={<Compass size={24} />} title="Pick at least one resource type" body="Choose programmes, funding, partners or talent to see matches." />
      ) : q.isPending ? (
        <SkeletonList rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.results.length === 0 ? (
        <EmptyState icon={<Compass size={24} />} title="No matches yet" body="Nothing in the directory fits this mission and filter. Try adding more resource types or broadening your objective." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.results.map((r, i) => (
            <ResultCard key={r.id} r={r} index={i} missionId={mission.id} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted">Entries marked illustrative are sample records for the prototype. Real programmes link to the provider's official site; check eligibility and deadlines there.</p>
    </div>
  )
}

function ResultCard({ r, index, missionId }: { r: EcoItem; index: number; missionId: string }) {
  const reduce = useReducedMotion()
  const qc = useQueryClient()
  const kind = KINDS.find((k) => k.id === r.kind) ?? KINDS[0]
  const Icon = kind.icon
  const save = useMutation({
    mutationFn: () => api.addMilestone({ mission_id: missionId, kind: 'opportunity_saved', label: `Saved: ${r.name}`, ref_id: r.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones', missionId] }),
  })
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: index * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="card grid content-start gap-4 p-5"
    >
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1">
            <Icon size={14} aria-hidden />
            {kind.label.slice(0, -1)}
          </span>
          <span className="font-mono">{COUNTRY_NAMES[r.country] ?? r.country}</span>
          {r.sample && <span className="rounded-full border border-line px-2 py-0.5">Illustrative</span>}
        </div>
        <h2 className="text-lg font-semibold leading-snug tracking-tight">{r.name}</h2>
        <p className="text-sm leading-relaxed text-muted">{r.summary}</p>
      </div>
      <div className="grid content-start gap-3">
        <div className="grid gap-1 rounded-xl bg-brand-soft p-3">
          <p className="text-xs font-medium">{r.fit === 'high' ? 'Strong fit' : r.fit === 'medium' ? 'Good fit' : 'Possible fit'}</p>
          <p className="text-sm">{r.reason}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || save.isSuccess}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent transition active:scale-[0.98] disabled:opacity-70"
          >
            {save.isSuccess ? <Check size={16} aria-hidden /> : <BookmarkSimple size={16} aria-hidden />}
            {save.isSuccess ? 'Saved to tracker' : 'Save'}
          </button>
          {r.url && (
            <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">
              Official site
              <ArrowSquareOut size={14} aria-hidden />
            </a>
          )}
        </div>
      </div>
    </motion.article>
  )
}
