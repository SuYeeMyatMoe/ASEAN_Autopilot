import { Fingerprint, Scales } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ButtonLink, Button, Disclaimer, EmptyState, ErrorState, MetaChip, PageHeader, SkeletonList, SourceLink, cx } from '../components/ui'
import { api, COUNTRY_NAMES, COVERED } from '../lib/api'
import { useSession } from '../lib/session'

export default function ComparePage() {
  const { founderId } = useSession()
  const [countries, setCountries] = useState<string[]>(['MY', 'ID', 'SG'])
  const cmp = useMutation({ mutationFn: () => api.compare(founderId!, countries) })

  if (!founderId)
    return (
      <EmptyState
        icon={<Fingerprint size={24} />}
        title="Start with your startup"
        body="The comparison is tailored to your sector and activities, so build your Founder DNA first."
        action={<ButtonLink to="/app/onboard">Build Founder DNA</ButtonLink>}
      />
    )

  const toggle = (c: string) => setCountries((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))
  const d = cmp.data

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Compare markets"
        body="See how requirements differ between markets for your startup. No ranking: just differences, unknowns and trade-offs to weigh."
        actions={d && <MetaChip meta={d.meta} />}
      />
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm font-medium">Markets</span>
        {COVERED.map((c) => (
          <label key={c} className={cx('inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm', countries.includes(c) ? 'border-brand bg-brand text-on-brand' : 'border-line')}>
            <input type="checkbox" className="sr-only" checked={countries.includes(c)} onChange={() => toggle(c)} />
            {COUNTRY_NAMES[c]}
          </label>
        ))}
        <Button className="ml-auto" onClick={() => cmp.mutate()} disabled={countries.length < 2 || cmp.isPending}>
          <Scales size={16} aria-hidden />
          {cmp.isPending ? 'Comparing' : 'Compare'}
        </Button>
        {countries.length < 2 && <p className="w-full text-xs" style={{ color: 'var(--st-missing)' }}>Pick at least two markets.</p>}
      </div>

      {cmp.isPending && <SkeletonList rows={3} />}
      {cmp.isError && <ErrorState error={cmp.error} onRetry={() => cmp.mutate()} />}
      {!d && !cmp.isPending && !cmp.isError && (
        <EmptyState icon={<Scales size={24} />} title="Choose markets to compare" body="Select two or three covered markets and run the comparison. Each cell links to the source it is based on." />
      )}

      {d && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">Requirement comparison by area and market</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="w-[200px] p-4 text-left font-medium text-muted">Area</th>
                  {d.countries.map((c) => (
                    <th key={c.code} scope="col" className="p-4 text-left font-semibold">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(d.areas).map(([code, name]) => (
                  <tr key={code} className="border-b border-line last:border-0 align-top">
                    <th scope="row" className="p-4 text-left font-medium">
                      <span className="mr-2 font-mono text-xs text-muted">{code}</span>
                      {name}
                    </th>
                    {d.countries.map((c) => {
                      const cell = d.grid[c.code][code]
                      const unsourced = cell.sources.length === 0
                      return (
                        <td key={c.code} className={cx('p-4', unsourced && 'bg-surface-2/60')}>
                          <p className={cx('leading-relaxed', unsourced && 'text-muted')}>{cell.highlight}</p>
                          {cell.unknowns.length > 0 && <p className="mt-1.5 text-xs text-muted">To verify: {cell.unknowns.join('; ')}</p>}
                          {cell.sources.slice(0, 1).map((s) => (
                            <div key={s.id} className="mt-2">
                              <SourceLink source={s} />
                            </div>
                          ))}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="card grid content-start gap-3 p-5">
              <h2 className="font-semibold tracking-tight">Trade-offs</h2>
              <ul className="grid list-disc gap-2 pl-5 text-sm leading-relaxed">{d.trade_offs.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
            <section className="card grid content-start gap-3 bg-brand-soft p-5">
              <h2 className="font-semibold tracking-tight">Questions to answer</h2>
              <ul className="grid list-disc gap-2 pl-5 text-sm leading-relaxed">{d.open_questions.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
          </div>
          <Disclaimer />
        </>
      )}
    </div>
  )
}
