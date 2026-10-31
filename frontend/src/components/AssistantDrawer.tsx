import { PaperPlaneRight, X } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type AssistantAnswer } from '../lib/api'
import { useSession } from '../lib/session'
import { Disclaimer, ErrorState, MetaChip, Skeleton, SourceLink, inputClass } from './ui'

const SUGGESTIONS = [
  'What should my Malaysian startup check before setting up in Indonesia?',
  'What licences might apply to a healthtech company entering Singapore?',
  'What should I check before recruiting foreign employees in Indonesia?',
  'Which data protection rules apply to patient data in Indonesia?',
]

export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { missionId } = useSession()
  const reduce = useReducedMotion()
  const [q, setQ] = useState('')
  const [history, setHistory] = useState<{ q: string; a: AssistantAnswer }[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const ask = useMutation({
    mutationFn: (question: string) => api.ask(question, missionId),
    onSuccess: (a, question) => {
      setHistory((h) => [...h, { q: question, a }])
      setQ('')
    },
  })

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const submit = (e?: FormEvent, text = q) => {
    e?.preventDefault()
    if (text.trim() && !ask.isPending) ask.mutate(text.trim())
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/35" onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label="Market-entry assistant"
            initial={reduce ? false : { x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-line bg-bg"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="font-semibold tracking-tight">Ask about market entry</h2>
                <p className="text-xs text-muted">Answers cite official sources only.</p>
              </div>
              <button onClick={onClose} aria-label="Close assistant" className="rounded-full p-2 hover:bg-surface-2">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {history.length === 0 && !ask.isPending && (
                <div className="grid gap-2">
                  <p className="text-sm text-muted">Try one of these:</p>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => submit(undefined, s)} className="card px-4 py-3 text-left text-sm transition hover:border-brand">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {history.map(({ q, a }, i) => (
                <div key={i} className="grid gap-3">
                  <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-on-brand">{q}</p>
                  <div className="card grid gap-3 p-4">
                    <p className="text-sm leading-relaxed">{a.answer}</p>
                    {a.citations.length > 0 ? (
                      <div className="grid gap-2 border-t border-line pt-3">
                        {a.citations.map((c) => (
                          <div key={c.id} className="grid gap-0.5">
                            <p className="text-xs font-medium">{c.title}</p>
                            <SourceLink source={c} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">No source record supports this answer. Treat it as unverified.</p>
                    )}
                    <div><MetaChip meta={a.meta} /></div>
                  </div>
                </div>
              ))}
              {ask.isPending && (
                <div className="card grid gap-2 p-4" role="status" aria-label="Searching sources">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              )}
              {ask.isError && <ErrorState error={ask.error} onRetry={() => submit()} />}
            </div>

            <form onSubmit={submit} className="grid gap-2 border-t border-line p-4">
              <label htmlFor="ask-input" className="sr-only">
                Your question
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  id="ask-input"
                  ref={inputRef}
                  rows={2}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) submit(e)
                  }}
                  placeholder="Ask about registration, licences, tax, hiring, IP or data"
                  className={inputClass + ' resize-none'}
                />
                <button
                  type="submit"
                  disabled={!q.trim() || ask.isPending}
                  aria-label="Send question"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition active:scale-[0.96] disabled:opacity-50"
                >
                  <PaperPlaneRight size={18} weight="bold" />
                </button>
              </div>
              <Disclaimer />
            </form>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
