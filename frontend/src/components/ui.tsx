import {
  ArrowSquareOut,
  CheckCircle,
  ClockCountdown,
  Gavel,
  Question,
  ShieldWarning,
  Sparkle,
  WarningCircle,
  Wrench,
} from '@phosphor-icons/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { GenMeta, Source, Status } from '../lib/api'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/* ---------- Buttons ---------- */
type Variant = 'primary' | 'brand' | 'ghost'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-95',
  brand: 'bg-brand text-on-brand hover:bg-brand-deep',
  ghost: 'border border-line bg-surface text-ink hover:bg-surface-2',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
    />
  )
}

export function ButtonLink({ to, variant = 'primary', className, children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition active:scale-[0.98]',
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}

/* ---------- Status ---------- */
export const STATUS: Record<Status, { label: string; icon: typeof CheckCircle; color: string; help: string }> = {
  information_available: { label: 'Information available', icon: CheckCircle, color: 'available', help: 'Your materials already cover this.' },
  action_required: { label: 'Action required', icon: Wrench, color: 'action', help: 'A task or document is needed.' },
  professional_review_required: { label: 'Professional review', icon: Gavel, color: 'review', help: 'A qualified local expert should confirm this.' },
  information_missing: { label: 'Information missing', icon: Question, color: 'missing', help: 'Add details so this can be assessed.' },
  source_verification_pending: { label: 'Source pending', icon: ClockCountdown, color: 'pending', help: 'No reliable current source confirmed yet.' },
}

export const STATUS_ORDER: Status[] = [
  'information_missing',
  'professional_review_required',
  'action_required',
  'source_verification_pending',
  'information_available',
]

export function StatusBadge({ status, compact }: { status: Status; compact?: boolean }) {
  const s = STATUS[status]
  const Icon = s.icon
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: `var(--st-${s.color})`, background: `var(--st-${s.color}-bg)` }}
      title={s.help}
    >
      <Icon size={14} weight="bold" aria-hidden />
      {compact ? <span className="sr-only">{s.label}</span> : s.label}
    </span>
  )
}

/* ---------- Sources ---------- */
export function SourceLink({ source }: { source: Pick<Source, 'title' | 'authority' | 'source_url' | 'verification_status' | 'last_verified'> & { id?: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <a href={source.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
        {source.authority}
        <ArrowSquareOut size={12} aria-hidden />
        <span className="sr-only">(opens official source)</span>
      </a>
      <VerificationTag status={source.verification_status} lastVerified={source.last_verified} />
      {source.id && <span className="font-mono">{source.id}</span>}
    </div>
  )
}

export function VerificationTag({ status, lastVerified }: { status: string; lastVerified: string | null }) {
  const reviewed = status === 'verified'
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <ShieldWarning size={12} aria-hidden weight={reviewed ? 'fill' : 'regular'} />
      {reviewed ? `Verified ${lastVerified}` : 'Seeded source, not yet reviewed'}
    </span>
  )
}

/* ---------- Model provenance ---------- */
export function MetaChip({ meta, onDark }: { meta?: GenMeta; onDark?: boolean }) {
  if (!meta) return null
  const live = meta.source === 'gemma'
  const label = live ? `Gemma 4${meta.model ? ` · ${meta.model}` : ''}` : meta.source === 'demo' ? 'Demo data' : 'Rule-based fallback'
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px]',
        onDark
          ? live
            ? 'border-transparent bg-accent text-on-accent'
            : 'border-white/30 text-on-brand/85'
          : live
            ? 'border-transparent bg-brand text-on-brand'
            : 'border-line text-muted',
      )}
      title={meta.notes.join('\n') || undefined}
    >
      <Sparkle size={12} weight={live ? 'fill' : 'regular'} aria-hidden />
      {label}
    </span>
  )
}

/* ---------- States ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card grid gap-3 p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-4 p-8 md:p-10">
      <div className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand dark:text-accent">{icon}</div>
      <div className="grid max-w-[52ch] gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm leading-relaxed text-muted">{body}</p>
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--st-missing)', background: 'var(--st-missing-bg)', color: 'var(--st-missing)' }}>
      <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
      <p className="flex-1">{msg}</p>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  )
}

export function PageHeader({ title, body, actions }: { title: string; body?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {body && <p className="max-w-[65ch] text-sm leading-relaxed text-muted md:text-base">{body}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Disclaimer() {
  return (
    <p className="text-xs leading-relaxed text-muted">
      Guidance only, not legal, tax or immigration advice. Confirm requirements with the responsible authority or a qualified local professional.
    </p>
  )
}

export function Field({ label, htmlFor, help, error, children }: { label: string; htmlFor: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {help && !error && <p className="text-xs text-muted">{help}</p>}
      {error && (
        <p className="text-xs font-medium" style={{ color: 'var(--st-missing)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'w-full rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/80 focus:border-brand focus:outline-none focus:ring-2 focus:ring-accent'
