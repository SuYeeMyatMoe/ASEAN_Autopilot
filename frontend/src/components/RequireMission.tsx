import { Target } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api, type FounderResponse, type Mission } from '../lib/api'
import { useSession } from '../lib/session'
import { ButtonLink, EmptyState, ErrorState, SkeletonList } from './ui'

/** Renders children only when a mission is active, with loading/empty/error states. */
export function RequireMission({ children }: { children: (m: { mission: Mission; founder: FounderResponse }) => ReactNode }) {
  const { missionId, founderId } = useSession()
  const q = useQuery({ queryKey: ['mission', missionId], queryFn: () => api.mission(missionId!), enabled: !!missionId })

  if (!missionId) {
    return (
      <EmptyState
        icon={<Target size={24} />}
        title="Set a mission first"
        body="Tell us your target market and what you want to achieve there. Every passport, roadmap and match is built around that mission."
        action={<ButtonLink to={founderId ? '/app/mission' : '/app/onboard'}>{founderId ? 'Set your mission' : 'Start with your startup'}</ButtonLink>}
      />
    )
  }
  if (q.isPending) return <SkeletonList rows={3} />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return <>{children(q.data)}</>
}
