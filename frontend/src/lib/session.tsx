import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface SessionState {
  founderId: string | null
  missionId: string | null
  setFounderId: (id: string | null) => void
  setMissionId: (id: string | null) => void
  reset: () => void
}

const SessionContext = createContext<SessionState | null>(null)
const KEY = 'amc-session'

function load(): { founderId: string | null; missionId: string | null } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* storage unavailable */
  }
  return { founderId: null, missionId: null }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable */
    }
  }, [state])

  const setFounderId = useCallback((founderId: string | null) => setState((s) => ({ ...s, founderId })), [])
  const setMissionId = useCallback((missionId: string | null) => setState((s) => ({ ...s, missionId })), [])
  const reset = useCallback(() => setState({ founderId: null, missionId: null }), [])

  const value = useMemo(() => ({ ...state, setFounderId, setMissionId, reset }), [state, setFounderId, setMissionId, reset])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.theme as 'light' | 'dark') || 'light',
  )
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem('amc-theme', next)
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }, [])
  return { theme, toggle }
}
