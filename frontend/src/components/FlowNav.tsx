import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { Link, useLocation } from 'react-router-dom'
import { useSession } from '../lib/session'
import { cx } from './ui'

/** The guided path through the app. Compare, Radar and Map are side trips, not steps. */
export const FLOW = [
  { path: '/app/onboard', label: 'Founder DNA', needs: null },
  { path: '/app/mission', label: 'Mission', needs: 'founder' },
  { path: '/app/passport', label: 'Launch Passport', needs: 'mission' },
  { path: '/app/gaps', label: 'Gap check', needs: 'mission' },
  { path: '/app/roadmap', label: 'Roadmap', needs: 'mission' },
  { path: '/app/discover', label: 'Discover', needs: 'mission' },
  { path: '/app/desk', label: 'Market Access Desk', needs: 'mission' },
] as const

const BLOCKED: Record<string, string> = {
  founder: 'Build your Founder DNA first',
  mission: 'Generate your Launch Passport first',
}

export function FlowNav() {
  const { pathname } = useLocation()
  const { founderId, missionId } = useSession()
  const i = FLOW.findIndex((s) => s.path === pathname)
  if (i === -1) return null

  const prev = FLOW[i - 1]
  const next = FLOW[i + 1]
  const ready = (needs: string | null) => !needs || (needs === 'founder' ? !!founderId : !!missionId)

  return (
    <nav aria-label="Mission steps" className="mt-12 grid gap-4 border-t border-line pt-6">
      <ol className="flex gap-1.5" aria-hidden>
        {FLOW.map((s, j) => (
          <li key={s.path} className={cx('h-1 flex-1 rounded-full', j <= i ? 'bg-brand dark:bg-accent' : 'bg-line')} />
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {prev ? (
          <Link to={prev.path} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm hover:bg-surface-2">
            <ArrowLeft size={16} aria-hidden />
            {prev.label}
          </Link>
        ) : (
          <span />
        )}
        <span className="order-first w-full text-xs text-muted sm:order-none sm:w-auto">
          Step {i + 1} of {FLOW.length}: {FLOW[i].label}
        </span>
        {next &&
          (ready(next.needs) ? (
            <Link
              to={next.path}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-on-brand transition hover:bg-brand-deep active:scale-[0.98]"
            >
              Next: {next.label}
              <ArrowRight size={16} aria-hidden />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-line px-5 py-2.5 text-sm text-muted">
              {BLOCKED[next.needs!]}
            </span>
          ))}
      </div>
    </nav>
  )
}
