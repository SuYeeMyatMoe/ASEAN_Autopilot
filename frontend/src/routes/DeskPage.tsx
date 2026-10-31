import { ArrowSquareOut, Bank, Briefcase, ClipboardText, Copy, FileText, Handshake } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { RequireMission } from '../components/RequireMission'
import { Button, Disclaimer, EmptyState, ErrorState, Field, MetaChip, PageHeader, Skeleton, SourceLink, cx, inputClass } from '../components/ui'
import { api, COUNTRY_NAMES, type ConsultPack, type Mission, type Referral } from '../lib/api'

const STATUSES = [
  ['referral_prepared', 'Referral prepared'],
  ['contact_provided', 'Contact information provided'],
  ['consultation_requested', 'Consultation requested'],
  ['appointment_pending', 'Appointment pending'],
  ['consultation_completed', 'Consultation completed'],
  ['documents_requested', 'Additional documents requested'],
  ['follow_up_required', 'Follow-up required'],
  ['resolved', 'Resolved'],
  ['escalated', 'Escalated'],
] as const

export default function DeskPage() {
  return <RequireMission>{({ mission }) => <Desk mission={mission} />}</RequireMission>
}

function Desk({ mission }: { mission: Mission }) {
  const [question, setQuestion] = useState(
    `I need to understand whether my product requires local healthcare approval before working with hospitals in ${COUNTRY_NAMES[mission.target]}.`,
  )
  const [touched, setTouched] = useState(false)
  const pack = useMutation({ mutationFn: () => api.consultPack(mission.id, question) })
  const dir = useQuery({ queryKey: ['referrals', mission.target], queryFn: () => api.referrals(mission.target) })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (question.trim().length >= 15) pack.mutate()
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Market Access Desk"
        body="Find the right authority or adviser, and walk in prepared. You review every package before anything is shared."
      />

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="grid content-start gap-4">
          <form onSubmit={submit} className="card grid gap-4 p-5">
            <Field
              label="Describe the issue you need help with"
              htmlFor="issue"
              error={touched && question.trim().length < 15 ? 'Add a little more detail so the package is useful.' : undefined}
            >
              <textarea id="issue" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} className={inputClass} />
            </Field>
            <Button type="submit" disabled={pack.isPending} className="justify-self-start">
              <ClipboardText size={16} aria-hidden />
              {pack.isPending ? 'Preparing package' : 'Prepare consultation package'}
            </Button>
          </form>
          {pack.isPending && (
            <div className="card grid gap-3 p-5" role="status" aria-label="Preparing package">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          )}
          {pack.isError && <ErrorState error={pack.error} onRetry={() => pack.mutate()} />}
          {pack.data && <PackView pack={pack.data.pack} meta={pack.data.meta} missionId={mission.id} />}
        </div>

        <aside className="grid content-start gap-4" aria-labelledby="dir-h">
          <h2 id="dir-h" className="font-semibold tracking-tight">Referral directory: {COUNTRY_NAMES[mission.target]}</h2>
          {dir.isPending ? (
            <Skeleton className="h-64" />
          ) : dir.isError ? (
            <ErrorState error={dir.error} onRetry={() => dir.refetch()} />
          ) : (
            <Directory referrals={dir.data.referrals} areas={dir.data.areas} />
          )}
        </aside>
      </div>

      <Requests missionId={mission.id} />
      <Disclaimer />
    </div>
  )
}

function Directory({ referrals, areas }: { referrals: Referral[]; areas: Record<string, string> }) {
  const groups: [string, Referral[], typeof Bank][] = [
    ['Government and agencies', referrals.filter((r) => r.type === 'government'), Bank],
    ['Professional support', referrals.filter((r) => r.type === 'professional'), Briefcase],
  ]
  return (
    <div className="grid gap-5">
      {groups.map(([label, list, Icon]) => (
        <div key={label} className="card grid gap-0 overflow-hidden">
          <p className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-sm font-medium">
            <Icon size={16} aria-hidden />
            {label}
          </p>
          {list.map((r) => (
            <div key={r.id} className="grid gap-1 border-b border-line px-4 py-3 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{r.name}</p>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" aria-label={`${r.name} official site`} className="shrink-0 rounded-full p-1 hover:bg-surface-2">
                    <ArrowSquareOut size={14} />
                  </a>
                )}
              </div>
              <p className="text-xs text-muted">{r.areas.map((a) => areas[a]).join(', ')}</p>
              <p className="text-xs">{r.channel}</p>
            </div>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted">Professional categories show the kind of adviser to approach. Named firms appear once partnerships are verified.</p>
    </div>
  )
}

function PackView({ pack, meta, missionId }: { pack: ConsultPack; meta: Parameters<typeof MetaChip>[0]['meta']; missionId: string }) {
  const qc = useQueryClient()
  const [reviewed, setReviewed] = useState(false)
  const [referral, setReferral] = useState(pack.referrals[0]?.id ?? '')
  const [copied, setCopied] = useState(false)
  const save = useMutation({
    mutationFn: () => api.saveRequest(missionId, referral, pack),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests', missionId] })
      qc.invalidateQueries({ queryKey: ['milestones', missionId] })
    },
  })

  const asText = [
    `Issue: ${pack.issue_summary}`,
    `Profile: ${pack.founder_profile}`,
    `Questions:\n${pack.questions_to_ask.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    `Documents: ${pack.documents_to_bring.join(', ')}`,
    `Not yet known: ${pack.missing_information.join(', ')}`,
  ].join('\n\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className="card grid gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <FileText size={20} aria-hidden />
          Consultation package
        </h2>
        <MetaChip meta={meta} />
      </div>
      <p className="text-sm leading-relaxed">{pack.founder_profile}</p>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted">Questions to ask</p>
        <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed">{pack.questions_to_ask.map((q) => <li key={q}>{q}</li>)}</ol>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <p className="text-xs font-medium text-muted">Documents to bring</p>
          <ul className="grid gap-1 text-sm">{pack.documents_to_bring.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
        <div className="grid content-start gap-1.5">
          <p className="text-xs font-medium text-muted">Not yet known</p>
          <ul className="grid gap-1 text-sm">{pack.missing_information.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      </div>
      {pack.sources.length > 0 && (
        <div className="grid gap-2 border-t border-line pt-4">
          <p className="text-xs font-medium text-muted">Based on</p>
          {pack.sources.map((s) => (
            <div key={s.id} className="grid gap-0.5">
              <p className="text-sm">{s.title}</p>
              <SourceLink source={s} />
            </div>
          ))}
        </div>
      )}

      <fieldset className="grid gap-2 border-t border-line pt-4">
        <legend className="mb-2 text-sm font-medium">Send to</legend>
        {pack.referrals.map((r) => (
          <label key={r.id} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm', referral === r.id ? 'border-brand bg-brand-soft' : 'border-line')}>
            <input type="radio" name="referral" value={r.id} checked={referral === r.id} onChange={() => setReferral(r.id)} className="mt-1 accent-[var(--brand)]" />
            <span className="grid gap-0.5">
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-muted">{r.channel}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-1 size-4 accent-[var(--brand)]" />
        I have reviewed this package and it describes my business accurately.
      </label>
      {save.isError && <ErrorState error={save.error} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="brand" disabled={!reviewed || !referral || save.isPending || save.isSuccess} onClick={() => save.mutate()}>
          <Handshake size={16} aria-hidden />
          {save.isSuccess ? 'Added to your requests' : save.isPending ? 'Saving' : 'Track this referral'}
        </Button>
        <Button variant="ghost" onClick={copy}>
          <Copy size={16} aria-hidden />
          {copied ? 'Copied' : 'Copy as text'}
        </Button>
      </div>
    </article>
  )
}

function Requests({ missionId }: { missionId: string }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['requests', missionId], queryFn: () => api.requests(missionId) })
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateRequest(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests', missionId] })
      qc.invalidateQueries({ queryKey: ['milestones', missionId] })
    },
  })

  return (
    <section className="grid gap-3" aria-labelledby="req-h">
      <h2 id="req-h" className="text-lg font-semibold tracking-tight">Your referrals</h2>
      {q.isPending ? (
        <Skeleton className="h-24" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.requests.length === 0 ? (
        <EmptyState icon={<Handshake size={24} />} title="No referrals tracked yet" body="Prepare a consultation package above, review it, and track it here as it moves from request to resolution." />
      ) : (
        <div className="card divide-y divide-line">
          {q.data.requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.referral?.name ?? r.referral_id}</p>
                <p className="truncate text-xs text-muted">{r.pack?.issue_summary}</p>
              </div>
              <label className="sr-only" htmlFor={`st-${r.id}`}>Status</label>
              <select
                id={`st-${r.id}`}
                value={r.status}
                onChange={(e) => update.mutate({ id: r.id, status: e.target.value })}
                className={inputClass + ' w-auto'}
              >
                {STATUSES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
