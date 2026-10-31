import { ArrowRight, FileArrowUp, Fingerprint, Image as ImageIcon, Lightning, Trash, Warning } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, COUNTRY_NAMES, type FounderResponse } from '../lib/api'
import { formatBytes, prepareUpload, UPLOAD_ACCEPT, UPLOAD_LIMIT_BYTES } from '../lib/files'
import { useSession } from '../lib/session'
import { DNA_STAGES, WorkingStatus } from '../components/WorkingStatus'
import { Button, ErrorState, Field, MetaChip, PageHeader, Skeleton, cx, inputClass } from '../components/ui'

export default function Onboard() {
  const { founderId, setFounderId, setMissionId } = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const existing = useQuery({ queryKey: ['founder', founderId], queryFn: () => api.founder(founderId!), enabled: !!founderId })

  const onDone = (r: FounderResponse) => {
    setFounderId(r.founder_id)
    setMissionId(null)
    qc.setQueryData(['founder', r.founder_id], r)
  }
  const extract = useMutation({ mutationFn: () => api.extractFounder(files, notes), onSuccess: onDone })
  const sample = useMutation({ mutationFn: api.sampleFounder, onSuccess: onDone })
  const busy = extract.isPending || sample.isPending || preparing

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return
    setPreparing(true)
    const prepared = await Promise.all(Array.from(list).map(prepareUpload))
    setPreparing(false)
    const next = [...files, ...prepared]
    const total = next.reduce((n, f) => n + f.size, 0)
    if (total > UPLOAD_LIMIT_BYTES) {
      setLocalError(`These files add up to ${formatBytes(total)}, over the 4 MB limit. Remove a file or upload fewer pages.`)
      return
    }
    setLocalError('')
    setFiles(next)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void addFiles(e.dataTransfer.files)
  }

  const result = extract.data ?? sample.data ?? existing.data
  const error = extract.error ?? sample.error

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Founder DNA"
        body="Upload your pitch deck, company profile or product screenshots. Gemma 4 reads them and builds the profile every other module uses."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="card grid content-start gap-5 p-5 md:p-6" aria-labelledby="upload-h">
          <h2 id="upload-h" className="font-semibold tracking-tight">Your materials</h2>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              'grid place-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
              dragging ? 'border-brand bg-brand-soft' : 'border-line bg-surface-2/50',
            )}
          >
            <FileArrowUp size={32} className="text-brand dark:text-accent" aria-hidden />
            <div className="grid gap-1">
              <p className="text-sm font-medium">Drop files here</p>
              <p className="max-w-[44ch] text-xs text-muted">PDF, Word, PowerPoint, Excel, CSV, text, or images (PNG, JPG, WebP, HEIC). Up to 4 MB in total; large photos are shrunk automatically.</p>
            </div>
            <Button variant="ghost" type="button" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
            <input ref={inputRef} type="file" multiple accept={UPLOAD_ACCEPT} className="sr-only" onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }} aria-label="Choose files to upload" />
          </div>

          {files.length > 0 && (
            <ul className="grid gap-2">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  {f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name) ? <ImageIcon size={18} aria-hidden /> : <FileArrowUp size={18} aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="font-mono text-xs text-muted">{formatBytes(f.size)}</span>
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="rounded-full p-1 hover:bg-line">
                    <Trash size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Field label="Anything the files don't say" htmlFor="notes" help="For example: ownership, where you host data, who you plan to hire.">
            <textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </Field>

          {localError && <ErrorState error={new Error(localError)} />}
          {error && <ErrorState error={error} />}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => extract.mutate()} disabled={busy || (!files.length && !notes.trim())}>
              <Fingerprint size={18} aria-hidden />
              {preparing ? 'Preparing files' : extract.isPending ? 'Reading your materials' : 'Build my profile'}
            </Button>
            <Button variant="ghost" onClick={() => sample.mutate()} disabled={busy}>
              <Lightning size={18} aria-hidden />
              {sample.isPending ? 'Loading sample' : 'Use the sample startup'}
            </Button>
          </div>
        </section>

        <section className="grid content-start gap-4" aria-live="polite">
          {busy ? (
            <div className="card grid gap-4 p-6">
              <WorkingStatus active={extract.isPending || sample.isPending} stages={DNA_STAGES} />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            </div>
          ) : result ? (
            <DnaCard r={result} onContinue={() => navigate('/app/mission')} />
          ) : (
            <div className="card grid gap-3 bg-brand p-6 text-on-brand">
              <p className="text-lg font-semibold tracking-tight">What Gemma 4 extracts</p>
              <ul className="grid gap-2 text-sm text-on-brand/85">
                <li>Industry, business model and stage</li>
                <li>Products and the activities you actually perform</li>
                <li>What personal or sensitive data you handle</li>
                <li>Team, hiring plans and expansion goals</li>
                <li>Questions an adviser would ask that your materials don't answer</li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function DnaCard({ r, onContinue }: { r: FounderResponse; onContinue: () => void }) {
  const d = r.dna
  const facts: [string, string][] = [
    ['Industry', d.industry],
    ['Stage', d.stage],
    ['Based in', COUNTRY_NAMES[d.origin_country] ?? d.origin_country],
    ['Business model', d.business_model],
    ['Team', d.team_size ? `${d.team_size} people` : ''],
    ['Sensitive data', d.processes_sensitive_data ? 'Yes' : 'Not detected'],
  ]
  return (
    <div className="card grid gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{d.company_name || 'Your startup'}</h2>
          <p className="text-sm text-muted">{d.products.join(', ') || d.business_activities[0] || 'Profile extracted'}</p>
        </div>
        <MetaChip meta={r.meta} />
      </div>

      <dl className="grid grid-cols-2 gap-3">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-sm font-medium">{v || <span className="text-muted">Unknown</span>}</dd>
          </div>
        ))}
      </dl>

      {[
        ['What you do', d.business_activities],
        ['Data you handle', d.data_handling],
        ['Expansion goals', d.expansion_objectives],
      ].map(([label, list]) =>
        (list as string[]).length ? (
          <div key={label as string} className="grid gap-1.5">
            <p className="text-xs font-medium text-muted">{label as string}</p>
            <ul className="grid gap-1 text-sm">
              {(list as string[]).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}

      {d.follow_up_questions.length > 0 && (
        <div className="grid gap-2 rounded-xl p-4" style={{ background: 'var(--st-missing-bg)' }}>
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--st-missing)' }}>
            <Warning size={16} weight="bold" aria-hidden />
            Still needed for an accurate passport
          </p>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {d.follow_up_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">Answer these in your mission description on the next step.</p>
        </div>
      )}

      {r.meta.notes.length > 0 && <p className="text-xs text-muted">{r.meta.notes.join(' ')}</p>}

      <Button variant="brand" onClick={onContinue} className="justify-self-start">
        Set your mission
        <ArrowRight size={16} aria-hidden />
      </Button>
    </div>
  )
}
