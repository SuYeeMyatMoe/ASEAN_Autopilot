import { Broadcast, Compass, Handshake } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { RequireMission } from '../components/RequireMission'
import { PageHeader, cx } from '../components/ui'
import { COUNTRY_NAMES, type Mission } from '../lib/api'
import { Desk } from './DeskPage'
import { Discover } from './DiscoverPage'
import { Radar } from './RadarPage'

const TABS = [
  { id: 'opportunities', label: 'Opportunities', icon: Compass },
  { id: 'advisers', label: 'Advisers', icon: Handshake },
  { id: 'regulation', label: 'Regulation', icon: Broadcast },
] as const

type TabId = (typeof TABS)[number]['id']

export default function MarketPage() {
  return <RequireMission>{({ mission }) => <Market mission={mission} />}</RequireMission>
}

function Market({ mission }: { mission: Mission }) {
  const [params, setParams] = useSearchParams()
  const current: TabId = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'opportunities'

  function select(id: TabId) {
    setParams(id === 'opportunities' ? {} : { tab: id }, { replace: true })
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Market desk"
        body={`The people, programmes and rule changes that matter for your ${COUNTRY_NAMES[mission.target] ?? mission.target} mission. One section at a time, so nothing gets lost.`}
      />

      <div role="tablist" aria-label="Market desk sections" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = current === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`market-tab-${id}`}
              aria-selected={on}
              aria-controls={`market-panel-${id}`}
              onClick={() => select(id)}
              className={cx(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition',
                on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface hover:bg-surface-2',
              )}
            >
              <Icon size={16} aria-hidden />
              {label}
            </button>
          )
        })}
      </div>

      <section role="tabpanel" id={`market-panel-${current}`} aria-labelledby={`market-tab-${current}`} className="min-w-0">
        {current === 'opportunities' && <Discover mission={mission} embedded />}
        {current === 'advisers' && <Desk mission={mission} embedded />}
        {current === 'regulation' && <Radar embedded />}
      </section>
    </div>
  )
}
