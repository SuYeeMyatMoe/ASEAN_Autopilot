import { cx } from './ui'

export function Logo({ inverted, compact }: { inverted?: boolean; compact?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5 font-semibold tracking-tight', inverted ? 'text-on-brand' : 'text-ink')}>
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-accent">
        <span className="size-3 rounded-full bg-brand" />
      </span>
      {!compact && <span className="whitespace-nowrap text-[15px] leading-none max-[380px]:hidden">ASEAN Mission Control</span>}
    </span>
  )
}
