import { useEffect, useState } from 'react'

/** Seconds elapsed while `active` is true; resets when it turns off. */
export function useElapsed(active: boolean) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = Date.now()
    const id = window.setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 500)
    return () => {
      window.clearInterval(id)
      setS(0)
    }
  }, [active])
  return s
}

/**
 * Shows what a long Gemma call is doing, so the wait doesn't look frozen.
 * `stages` are [startSecond, message] pairs in ascending order.
 */
export function WorkingStatus({ active, stages }: { active: boolean; stages: [number, string][] }) {
  const s = useElapsed(active)
  if (!active) return null
  const message = [...stages].reverse().find(([at]) => s >= at)?.[1] ?? stages[0][1]
  return (
    <div className="grid gap-2" role="status" aria-live="polite">
      <div className="h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="amc-progress h-full w-1/3 rounded-full bg-brand dark:bg-accent" />
      </div>
      <p className="flex items-center justify-between gap-3 text-sm">
        <span>{message}</span>
        <span className="font-mono text-xs text-muted">{s}s</span>
      </p>
    </div>
  )
}

export const DNA_STAGES: [number, string][] = [
  [0, 'Uploading your files'],
  [2, 'Gemma 4 is reading your materials'],
  [8, 'Building your Founder DNA'],
  [20, 'Gemma 4 is busy, switching to a backup model'],
]

export const PASSPORT_STAGES: [number, string][] = [
  [0, 'Matching your profile against official sources'],
  [6, 'Gemma 4 is checking each requirement'],
  [16, 'Writing your next steps'],
  [30, 'Gemma 4 is busy, switching to a backup model'],
]
