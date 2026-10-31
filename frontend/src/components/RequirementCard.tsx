import { CaretDown } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { PassportItem } from '../lib/api'
import { SourceLink, StatusBadge, cx } from './ui'

export function RequirementCard({ item, defaultOpen }: { item: PassportItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const id = `req-${item.record_id}`
  return (
    <article className={cx('card overflow-hidden', !item.applies && 'opacity-70')}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} className="flex w-full items-start gap-4 p-5 text-left">
        <div className="grid flex-1 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            {!item.applies && <span className="text-xs text-muted">Likely not applicable</span>}
          </div>
          <h3 className="font-semibold leading-snug tracking-tight">{item.title}</h3>
          <p className="text-sm leading-relaxed text-muted">{item.why_it_applies}</p>
        </div>
        <CaretDown size={18} className={cx('mt-1 shrink-0 transition', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <div className="grid gap-4 border-t border-line px-5 py-4">
              <div className="rounded-xl bg-brand-soft px-4 py-3">
                <p className="text-xs font-medium text-muted">Next step</p>
                <p className="text-sm font-medium">{item.next_action}</p>
              </div>
              {(item.evidence_available.length > 0 || item.missing.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid content-start gap-1.5">
                    <p className="text-xs font-medium text-muted">What you already have</p>
                    {item.evidence_available.length ? (
                      <ul className="grid gap-1 text-sm">{item.evidence_available.map((e) => <li key={e}>{e}</li>)}</ul>
                    ) : (
                      <p className="text-sm text-muted">Nothing in your materials yet</p>
                    )}
                  </div>
                  <div className="grid content-start gap-1.5">
                    <p className="text-xs font-medium text-muted">Still to find out</p>
                    {item.missing.length ? (
                      <ul className="grid gap-1 text-sm">{item.missing.map((e) => <li key={e}>{e}</li>)}</ul>
                    ) : (
                      <p className="text-sm text-muted">No open questions recorded</p>
                    )}
                  </div>
                </div>
              )}
              <div className="grid gap-1.5">
                <p className="text-xs font-medium text-muted">What the source says</p>
                <p className="text-sm leading-relaxed">{item.summary}</p>
                <p className="text-xs text-muted">{item.instrument}</p>
              </div>
              <SourceLink source={{ ...item, id: item.record_id }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  )
}
