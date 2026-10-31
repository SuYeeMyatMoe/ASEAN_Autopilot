import { ArrowRight, FileText, Fingerprint, Flag, Plus } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, COUNTRY_NAMES, COVERED, type FounderResponse } from '../lib/api'
import { useSession } from '../lib/session'
import { PASSPORT_STAGES, WorkingStatus } from '../components/WorkingStatus'
import { Button, ButtonLink, EmptyState, ErrorState, Field, PageHeader, SkeletonList, STATUS_ORDER, StatusBadge, cx, inputClass } from '../components/ui'

const TARGETS = ['ID', 'SG', 'MY', 'TH', 'VN', 'PH', 'KH', 'LA', 'MM', 'BN', 'TL']

export default function MissionPage() {
  const { founderId, missionId, setMissionId } = useSession()
  const founder = useQuery({ queryKey: ['founder', founderId], queryFn: () => api.founder(founderId!), enabled: !!founderId })

  if (!founderId) {
    return (
      <EmptyState
        icon={<Fingerprint size={24} />}
        title="Start with your startup"
        body="Upload your materials or load the sample startup so the mission can be matched to what you actually do."
        action={<ButtonLink to="/app/onboard">Build Founder DNA</ButtonLink>}
      />
    )
  }
  if (founder.isPending) return <SkeletonList rows={2} />
  if (founder.isError) return <ErrorState error={founder.error} onRetry={() => founder.refetch()} />

  return (
    <div className="grid gap-10">
      <PageHeader
        title="Mission"
        body="Pick a target market and describe what you want to do there. The Launch Passport, roadmap and matches are built from this."
      />
      <UploadSummary f={founder.data} />
      <MissionForm
        key={founder.data.founder_id}
        origin={founder.data.dna.origin_country}
        defaultObjective={objectiveFromUpload(founder.data)}
        defaultTarget={defaultTarget(founder.data)}
        questions={founder.data.dna.follow_up_questions}
        onCreated={setMissionId}
      />
      {missionId && <Tracker missionId={missionId} />}
      {(founder.data.missions?.length ?? 0) > 1 && (
        <section className="grid gap-3">
          <h2 className="font-semibold tracking-tight">Earlier missions</h2>
          <div className="flex flex-wrap gap-2">
            {founder.data.missions!.map((m) => (
              <button
                key={m.id}
                onClick={() => setMissionId(m.id)}
                className={cx('rounded-full border px-4 py-2 text-sm', m.id === missionId ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface hover:bg-surface-2')}
              >
                {COUNTRY_NAMES[m.target]}: {m.objective.slice(0, 40)}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** Goal text pre-filled from what the uploaded files said. */
function objectiveFromUpload(f: FounderResponse): string {
  const d = f.dna
  const goals = d.expansion_objectives.map((g) => g.trim().replace(/[.\s]+$/, '')).filter(Boolean).map((g) => g[0].toUpperCase() + g.slice(1))
  if (goals.length) return goals.join('. ') + '.'
  const what = d.products[0] || d.business_activities[0]
  return what ? `Bring ${what} to a new ASEAN market, find pilot customers and the right local partners.` : ''
}

/** First covered market the files mention, else the first covered market that isn't home. */
function defaultTarget(f: FounderResponse): string {
  const home = f.dna.origin_country
  return f.dna.target_countries.find((c) => COVERED.includes(c) && c !== home) ?? COVERED.find((c) => c !== home) ?? 'ID'
}

function UploadSummary({ f }: { f: FounderResponse }) {
  const d = f.dna
  const files = (f.meta.files ?? []).filter((n) => n !== 'sample profile')
  const facts = [d.industry, d.stage, d.origin_country && `Based in ${COUNTRY_NAMES[d.origin_country] ?? d.origin_country}`, d.team_size && `${d.team_size} people`].filter(Boolean)
  return (
    <section className="card grid gap-3 p-5 md:p-6" aria-labelledby="upload-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="upload-summary" className="font-semibold tracking-tight">
          From your upload: {d.company_name || 'your startup'}
        </h2>
        <ButtonLink to="/app/onboard" variant="ghost" className="px-3 py-1.5 text-xs">
          Change files
        </ButtonLink>
      </div>
      {facts.length > 0 && <p className="text-sm text-muted">{facts.join(' · ')}</p>}
      {d.materials_summary && <p className="max-w-[80ch] text-sm leading-relaxed">{d.materials_summary}</p>}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((n) => (
            <li key={n} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs">
              <FileText size={12} aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Everything below, and every later step, uses this profile and the text from your files.</p>
    </section>
  )
}

function MissionForm({
  origin,
  defaultObjective,
  defaultTarget,
  questions,
  onCreated,
}: {
  origin: string
  defaultObjective: string
  defaultTarget: string
  questions: string[]
  onCreated: (id: string) => void
}) {
  const objectiveRef = useRef<HTMLTextAreaElement>(null)
  const [answered, setAnswered] = useState<string[]>([])
  const { founderId } = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [target, setTarget] = useState(defaultTarget)
  const [objective, setObjective] = useState(defaultObjective)
  const [touched, setTouched] = useState(false)

  const create = useMutation({
    mutationFn: async () => {
      const m = await api.createMission({ founder_id: founderId!, target, objective })
      const p = await api.generatePassport(m.id)
      return { m, p }
    },
    onSuccess: ({ m, p }) => {
      onCreated(m.id)
      qc.setQueryData(['passport', m.id], p)
      qc.invalidateQueries({ queryKey: ['founder', founderId] })
      navigate('/app/passport')
    },
  })

  const objectiveError = touched && objective.trim().length < 15 ? 'Describe the goal in a sentence or two, for example: run a hospital pilot and hire engineers.' : ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (objective.trim().length >= 15) create.mutate()
  }

  return (
    <form onSubmit={submit} className="card grid gap-6 p-5 md:p-6">
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">
          Target market <span className="font-normal text-muted">(from {COUNTRY_NAMES[origin] ?? 'your home market'})</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {TARGETS.filter((c) => c !== origin).map((c) => {
            const covered = COVERED.includes(c)
            const active = target === c
            return (
              <label
                key={c}
                className={cx(
                  'relative flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-sm transition',
                  active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface hover:border-brand',
                  !covered && 'cursor-not-allowed opacity-60 hover:border-line',
                )}
              >
                <input type="radio" name="target" value={c} checked={active} disabled={!covered} onChange={() => setTarget(c)} className="sr-only" />
                <span className="font-medium">{COUNTRY_NAMES[c]}</span>
                <span className={cx('text-xs', active ? 'text-on-brand/75' : 'text-muted')}>{covered ? 'Sources available' : 'Coming soon'}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <Field label="What do you want to achieve there?" htmlFor="objective" error={objectiveError} help="Include the activities, partners and hires you have in mind, plus anything from the open questions.">
        <textarea id="objective" ref={objectiveRef} rows={5} value={objective} onBlur={() => setTouched(true)} onChange={(e) => setObjective(e.target.value)} className={inputClass} />
      </Field>

      {questions.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Open questions from your upload</p>
          <p className="text-xs text-muted">Add an answer to your goal so the passport can assess more requirements.</p>
          <ul className="grid gap-2">
            {questions.map((q) => {
              const done = answered.includes(q)
              return (
                <li key={q} className="flex items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                  <span className="flex-1">{q}</span>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => {
                      setAnswered((a) => [...a, q])
                      setObjective((o) => `${o.trim()}
${q.replace(/\?$/, '')}: `)
                      requestAnimationFrame(() => {
                        const el = objectiveRef.current
                        if (!el) return
                        el.focus()
                        el.setSelectionRange(el.value.length, el.value.length)
                      })
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs hover:border-brand disabled:opacity-50"
                  >
                    <Plus size={12} aria-hidden />
                    {done ? 'Added' : 'Answer'}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {create.isError && <ErrorState error={create.error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Building your passport' : 'Generate Launch Passport'}
          {!create.isPending && <ArrowRight size={16} aria-hidden />}
        </Button>
      </div>
      <WorkingStatus active={create.isPending} stages={PASSPORT_STAGES} />
    </form>
  )
}

const QUICK = [
  { kind: 'opportunity_saved', label: 'Opportunity saved' },
  { kind: 'introduction_requested', label: 'Introduction requested' },
  { kind: 'poc_started', label: 'Pilot or POC started' },
  { kind: 'requirement_confirmed', label: 'Requirement confirmed by adviser' },
]

function Tracker({ missionId }: { missionId: string }) {
  const qc = useQueryClient()
  const passport = useQuery({ queryKey: ['passport', missionId], queryFn: () => api.passport(missionId), retry: false })
  const ms = useQuery({ queryKey: ['milestones', missionId], queryFn: () => api.milestones(missionId) })
  const add = useMutation({
    mutationFn: (q: (typeof QUICK)[number]) => api.addMilestone({ mission_id: missionId, ...q }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones', missionId] }),
  })

  return (
    <section className="grid gap-4" aria-labelledby="tracker-h">
      <h2 id="tracker-h" className="text-lg font-semibold tracking-tight">Impact Tracker</h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="card grid content-start gap-4 p-5">
          <p className="text-sm font-medium">Market-entry readiness</p>
          {passport.data ? (
            <ul className="grid gap-2">
              {STATUS_ORDER.map((s) => (
                <li key={s} className="flex items-center justify-between gap-3">
                  <StatusBadge status={s} />
                  <span className="font-mono text-sm">{passport.data.status_counts[s] ?? 0}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No passport yet for this mission.</p>
          )}
          <ButtonLink to="/app/gaps" variant="ghost" className="justify-self-start">
            Open gap check
          </ButtonLink>
        </div>
        <div className="card grid content-start gap-4 p-5">
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button key={q.kind} onClick={() => add.mutate(q)} disabled={add.isPending} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs hover:bg-surface-2">
                <Plus size={12} aria-hidden />
                {q.label}
              </button>
            ))}
          </div>
          {ms.data?.milestones.length ? (
            <ol className="grid gap-3">
              {ms.data.milestones.slice(0, 8).map((m) => (
                <li key={m.id} className="flex items-start gap-3 text-sm">
                  <Flag size={16} className="mt-0.5 shrink-0 text-brand dark:text-accent" aria-hidden />
                  <span className="flex-1">{m.label}</span>
                  <time className="font-mono text-xs text-muted">{new Date(m.created_at).toLocaleDateString()}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Milestones appear here as you prepare consultations, save opportunities and start pilots.</p>
          )}
        </div>
      </div>
    </section>
  )
}
