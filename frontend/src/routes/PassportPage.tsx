import { ArrowsClockwise, IdentificationBadge } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { RequireMission } from '../components/RequireMission'
import { RequirementCard } from '../components/RequirementCard'
import { Button, Disclaimer, EmptyState, ErrorState, MetaChip, PageHeader, SkeletonList, STATUS_ORDER, StatusBadge, cx } from '../components/ui'
import { COUNTRY_NAMES, type FounderResponse, type Mission, type PassportResponse } from '../lib/api'
import { usePassport } from '../lib/usePassport'

export default function PassportPage() {
  return <RequireMission>{(m) => <Passport {...m} />}</RequireMission>
}

function Passport({ mission, founder }: { mission: Mission; founder: FounderResponse }) {
  const { query, generate, missing } = usePassport(mission.id)
  const p = generate.data ?? query.data

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Country Launch Passport"
        body="Requirements that may apply to your expansion, matched to your profile and linked to the official source."
        actions={
          p && (
            <Button variant="ghost" onClick={() => generate.mutate()} disabled={generate.isPending}>
              <ArrowsClockwise size={16} aria-hidden className={cx(generate.isPending && 'animate-spin')} />
              {generate.isPending ? 'Regenerating' : 'Regenerate'}
            </Button>
          )
        }
      />
      {generate.isError && <ErrorState error={generate.error} onRetry={() => generate.mutate()} />}
      {query.isPending || (generate.isPending && !p) ? (
        <SkeletonList rows={4} />
      ) : missing && !p ? (
        <EmptyState
          icon={<IdentificationBadge size={24} />}
          title="No passport for this mission yet"
          body={`Generate a passport for ${COUNTRY_NAMES[mission.target]}. Gemma 4 checks each official source against your profile.`}
          action={<Button onClick={() => generate.mutate()} disabled={generate.isPending}>{generate.isPending ? 'Building your passport' : 'Generate passport'}</Button>}
        />
      ) : query.isError && !p ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : p ? (
        <PassportBody p={p} mission={mission} founder={founder} />
      ) : null}
    </div>
  )
}

function PassportBody({ p, mission, founder }: { p: PassportResponse; mission: Mission; founder: FounderResponse }) {
  const areas = useMemo(() => {
    const map = new Map<string, string>()
    p.items.forEach((i) => map.set(i.area, i.area_name))
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [p.items])
  const [area, setArea] = useState<string>('all')
  const items = p.items
    .filter((i) => area === 'all' || i.area === area)
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

  return (
    <>
      {/* Passport cover */}
      <section className="grid overflow-hidden rounded-[20px] bg-brand text-on-brand md:grid-cols-[1.3fr_1fr]">
        <div className="grid content-between gap-8 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-xs text-on-brand/70">Passport {p.passport_id}</span>
            <MetaChip meta={p.meta} onDark />
          </div>
          <div className="grid gap-2">
            <p className="text-sm text-on-brand/75">{founder.dna.company_name || 'Your startup'}</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {COUNTRY_NAMES[mission.origin]} <span className="text-accent">to</span> {COUNTRY_NAMES[mission.target]}
            </h2>
            <p className="max-w-[60ch] text-sm leading-relaxed text-on-brand/80">{p.summary}</p>
          </div>
          <p className="font-mono text-xs text-on-brand/60">Issued {new Date(p.created_at).toLocaleDateString()}</p>
        </div>
        <div className="grid content-center gap-2 bg-brand-deep p-6 md:p-8">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
              <StatusBadge status={s} />
              <span className="font-mono text-lg">{p.status_counts[s] ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Area tabs */}
      <div role="tablist" aria-label="Requirement areas" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {[['all', 'All areas'] as [string, string], ...areas].map(([code, name]) => (
          <button
            key={code}
            role="tab"
            aria-selected={area === code}
            onClick={() => setArea(code)}
            className={cx(
              'shrink-0 rounded-full border px-4 py-2 text-sm transition',
              area === code ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface hover:bg-surface-2',
            )}
          >
            {code !== 'all' && <span className="mr-1.5 font-mono text-xs opacity-70">{code}</span>}
            {name}
          </button>
        ))}
      </div>

      <div className="grid gap-3" role="tabpanel">
        {items.map((it, i) => (
          <RequirementCard key={it.record_id} item={it} defaultOpen={i === 0} />
        ))}
      </div>

      {p.meta.notes.length > 0 && <p className="text-xs text-muted">{p.meta.notes.join(' ')}</p>}
      <Disclaimer />
    </>
  )
}
