import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'

export function usePassport(missionId: string) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['passport', missionId],
    queryFn: () => api.passport(missionId),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  })
  const generate = useMutation({
    mutationFn: () => api.generatePassport(missionId),
    onSuccess: (p) => {
      qc.setQueryData(['passport', missionId], p)
      qc.invalidateQueries({ queryKey: ['roadmap', missionId] })
    },
  })
  const missing = query.error instanceof ApiError && query.error.status === 404
  return { query, generate, missing }
}
