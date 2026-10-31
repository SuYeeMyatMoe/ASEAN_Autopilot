import {
  ArrowRight,
  CheckCircle,
  FileText,
  Microphone,
  MicrophoneSlash,
  Paperclip,
  PaperPlaneRight,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  Waveform,
  X,
} from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, type CompanionReply, type DocExplanation } from '../lib/api'
import { prepareUpload, UPLOAD_ACCEPT, UPLOAD_LIMIT_BYTES } from '../lib/files'
import { useSession } from '../lib/session'
import { bcpFor, COMPANION_LANGS, speechInputSupported, speechOutputSupported, useSpeechInput, useSpeechOutput } from '../lib/speech'
import { Disclaimer, MetaChip, Skeleton, SourceLink, cx, inputClass } from './ui'

type Msg =
  | { id: string; role: 'user'; text: string; voice: boolean }
  | { id: string; role: 'companion'; reply: CompanionReply; done?: string; noVoice?: boolean }
  | { id: string; role: 'doc'; doc: DocExplanation }
  | { id: string; role: 'error'; text: string }

const STARTERS: Record<string, string[]> = {
  en: ["I'm overwhelmed. What should I do first?", 'Which licences might apply to my product?', 'Show me funding options', 'How far along is my mission?'],
  ms: ['Saya rasa tertekan. Apa yang perlu saya buat dahulu?', 'Lesen apa yang mungkin diperlukan untuk produk saya?', 'Tunjukkan pilihan pembiayaan', 'Bagaimana kemajuan misi saya?'],
  id: ['Saya bingung. Apa yang harus saya lakukan dulu?', 'Izin apa yang mungkin berlaku untuk produk saya?', 'Tampilkan opsi pendanaan', 'Sejauh mana kemajuan misi saya?'],
  th: ['ฉันรู้สึกสับสน ควรเริ่มทำอะไรก่อน', 'ผลิตภัณฑ์ของฉันอาจต้องใช้ใบอนุญาตอะไรบ้าง', 'แสดงตัวเลือกแหล่งเงินทุน'],
  vi: ['Tôi thấy quá tải. Tôi nên làm gì trước?', 'Sản phẩm của tôi có thể cần giấy phép nào?', 'Cho tôi xem các lựa chọn tài trợ'],
}

const GREETING: Record<string, string> = {
  en: "Hi, I'm your Mission Companion. Ask me anything about expanding across ASEAN. We'll take it one step at a time.",
  ms: 'Hai, saya Mission Companion anda. Tanya apa sahaja tentang perkembangan ke ASEAN. Kita ambil satu langkah pada satu masa.',
  id: 'Halo, saya Mission Companion Anda. Tanyakan apa saja tentang ekspansi ke ASEAN. Kita jalani satu langkah demi satu langkah.',
  th: 'สวัสดี ฉันคือ Mission Companion ถามอะไรก็ได้เกี่ยวกับการขยายธุรกิจในอาเซียน เราจะค่อยๆ ไปทีละขั้น',
  vi: 'Xin chào, tôi là Mission Companion. Hãy hỏi tôi bất cứ điều gì về việc mở rộng ra ASEAN. Chúng ta sẽ đi từng bước một.',
}

let seq = 0
const uid = () => `m${++seq}`

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage unavailable */
  }
}

export function CompanionPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { missionId, founderId } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const reduce = useReducedMotion()
  const [lang, setLangState] = useState<string>(() => loadPref('amc-companion-lang', 'auto'))
  const [voiceOut, setVoiceOutState] = useState<boolean>(() => loadPref('amc-companion-voice', true))
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [fileError, setFileError] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { speak, stopSpeaking, speakingId } = useSpeechOutput()

  const setLang = (l: string) => {
    setLangState(l)
    savePref('amc-companion-lang', l)
  }
  const setVoiceOut = (v: boolean) => {
    setVoiceOutState(v)
    savePref('amc-companion-voice', v)
    if (!v) stopSpeaking()
  }

  const brief = useQuery({
    queryKey: ['companion-brief', missionId, founderId],
    queryFn: () => api.companionBrief(missionId, founderId),
    enabled: open,
  })

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [msgs, reduce])

  useEffect(() => {
    if (!open) {
      stopSpeaking()
      return
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, stopSpeaking])

  const runAction = useCallback(
    async (r: CompanionReply): Promise<string | undefined> => {
      const a = r.action
      switch (a.type) {
        case 'open_page':
          navigate(`/app/${a.params.page}`)
          return a.label || 'Opened the page'
        case 'search_opportunities':
          navigate(`/app/discover?kinds=${(a.params.kinds ?? []).join(',')}`)
          return a.label || 'Opened Discover'
        case 'compare_markets':
          navigate(`/app/compare?countries=${(a.params.countries ?? []).join(',')}&run=1`)
          return a.label || 'Opened Compare markets'
        case 'check_progress':
          navigate('/app/mission')
          return a.label || 'Opened your mission progress'
        case 'save_opportunity':
          if (!missionId || !a.params.id) return 'Set a mission first so I can save items for you'
          await api.addMilestone({ mission_id: missionId, kind: 'opportunity_saved', label: a.label || `Saved ${a.params.id}`, ref_id: a.params.id })
          qc.invalidateQueries({ queryKey: ['milestones', missionId] })
          return a.label || 'Saved to your tracker'
        default:
          return undefined
      }
    },
    [navigate, missionId, qc],
  )

  const say = useCallback(
    (id: string, r: CompanionReply) => {
      if (!voiceOut) return true
      const spoken = r.next_step ? `${r.reply} ${r.next_step}` : r.reply
      return speak(id, spoken, bcpFor(r.language))
    },
    [voiceOut, speak],
  )

  const chat = useMutation({
    mutationFn: (message: string) =>
      api.companionChat({
        message,
        language: lang,
        mission_id: missionId,
        founder_id: founderId,
        page: location.pathname.replace('/app/', ''),
        history: msgs
          .filter((m) => m.role === 'user' || m.role === 'companion')
          .slice(-6)
          .map((m) => (m.role === 'user' ? { role: 'user' as const, text: m.text } : { role: 'companion' as const, text: (m as { reply: CompanionReply }).reply.reply })),
      }),
    onSuccess: async (reply) => {
      const id = uid()
      setMsgs((ms) => [...ms, { id, role: 'companion', reply }])
      const ok = say(id, reply)
      const done = await runAction(reply).catch(() => 'That action did not complete. Try again from the page itself.')
      if (done || !ok) setMsgs((ms) => ms.map((m) => (m.id === id ? { ...m, done, noVoice: !ok } as Msg : m)))
    },
    onError: (e) => setMsgs((ms) => [...ms, { id: uid(), role: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' }]),
  })

  const doc = useMutation({
    mutationFn: async (file: File) => api.companionDocument(await prepareUpload(file), text, lang === 'auto' ? 'en' : lang, missionId),
    onSuccess: (d) => {
      const id = uid()
      setMsgs((ms) => [...ms, { id, role: 'doc', doc: d }])
      if (voiceOut) speak(id, d.explanation.summary, bcpFor(d.explanation.language))
      setText('')
    },
    onError: (e) => setMsgs((ms) => [...ms, { id: uid(), role: 'error', text: e instanceof Error ? e.message : 'Could not read that document.' }]),
  })

  const busy = chat.isPending || doc.isPending

  const send = useCallback(
    (message: string, voice = false) => {
      const m = message.trim()
      if (!m || chat.isPending) return
      stopSpeaking()
      setMsgs((ms) => [...ms, { id: uid(), role: 'user', text: m, voice }])
      setText('')
      chat.mutate(m)
    },
    [chat, stopSpeaking],
  )

  const mic = useSpeechInput(bcpFor(lang), (t) => send(t, true))
  const canListen = speechInputSupported()

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(text)
  }

  const onFile = (f: File | undefined) => {
    setFileError('')
    if (!f) return
    if (f.size > UPLOAD_LIMIT_BYTES && !f.type.startsWith('image/')) {
      setFileError('That file is over 4 MB. Upload a smaller file or a few page screenshots.')
      return
    }
    setMsgs((ms) => [...ms, { id: uid(), role: 'user', text: `Explain this document: ${f.name}${text.trim() ? `. ${text.trim()}` : ''}`, voice: false }])
    doc.mutate(f)
  }

  const langKey = lang === 'auto' ? 'en' : lang
  const starters = STARTERS[langKey] ?? STARTERS.en

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label="Mission Companion"
            initial={reduce ? false : { x: 480 }}
            animate={{ x: 0 }}
            exit={{ x: 480 }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-line bg-bg"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-accent">
                <Waveform size={20} weight="bold" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold leading-tight tracking-tight">Mission Companion</h2>
                <p className="truncate text-xs text-muted">Ask, listen, and take your next step</p>
              </div>
              <button
                onClick={() => setVoiceOut(!voiceOut)}
                aria-pressed={voiceOut}
                aria-label={voiceOut ? 'Stop reading replies aloud' : 'Read replies aloud'}
                title={voiceOut ? 'Replies are read aloud' : 'Replies are text only'}
                className="rounded-full p-2 hover:bg-surface-2"
                disabled={!speechOutputSupported()}
              >
                {voiceOut ? <SpeakerHigh size={20} /> : <SpeakerSlash size={20} />}
              </button>
              <button onClick={onClose} aria-label="Close Mission Companion" className="rounded-full p-2 hover:bg-surface-2">
                <X size={20} />
              </button>
            </div>
            <div className="flex items-center gap-2 border-b border-line px-5 py-2">
              <label htmlFor="companion-lang" className="text-xs text-muted">
                Language
              </label>
              <select
                id="companion-lang"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-sm focus:border-brand focus:outline-none"
              >
                {COMPANION_LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Conversation */}
            <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
              {msgs.length === 0 && (
                <div className="grid gap-4">
                  <p className="text-[15px] leading-relaxed">{GREETING[langKey] ?? GREETING.en}</p>
                  {brief.isPending ? (
                    <Skeleton className="h-20" />
                  ) : brief.data?.nudges.length ? (
                    <div className="grid gap-2">
                      <p className="text-xs font-medium text-muted">Needs your attention</p>
                      {brief.data.nudges.map((n, i) => (
                        <button
                          key={i}
                          onClick={() => navigate(`/app/${n.page}`)}
                          className="card flex items-start gap-3 px-4 py-3 text-left text-sm transition hover:border-brand"
                        >
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full"
                            style={{ background: n.kind === 'missing' ? 'var(--st-missing)' : n.kind === 'review' ? 'var(--st-review)' : 'var(--st-available)' }}
                            aria-hidden
                          />
                          <span className="flex-1">{n.text}</span>
                          <ArrowRight size={14} className="mt-1 shrink-0 text-muted" aria-hidden />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {starters.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-sm hover:border-brand">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="ml-auto flex max-w-[85%] items-start gap-2 rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-on-brand">
                    {m.voice && <Microphone size={14} className="mt-0.5 shrink-0 opacity-70" aria-label="Spoken" />}
                    <span>{m.text}</span>
                  </div>
                ) : m.role === 'companion' ? (
                  <CompanionMessage key={m.id} m={m} speaking={speakingId === m.id} onReplay={() => say(m.id, m.reply)} onStop={stopSpeaking} onAsk={send} />
                ) : m.role === 'doc' ? (
                  <DocMessage key={m.id} d={m.doc} />
                ) : (
                  <p key={m.id} role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--st-missing-bg)', color: 'var(--st-missing)' }}>
                    {m.text}
                  </p>
                ),
              )}

              {busy && (
                <div className="card grid gap-2 p-4" role="status" aria-label="Mission Companion is thinking">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="grid gap-3 border-t border-line px-5 pb-4 pt-3">
              {(mic.listening || mic.interim) && (
                <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted" aria-live="polite">
                  {mic.interim || 'Listening...'}
                </p>
              )}
              {(mic.error || fileError) && (
                <p role="alert" className="text-xs" style={{ color: 'var(--st-missing)' }}>
                  {mic.error || fileError}
                </p>
              )}
              <div className="flex items-end gap-2">
                <div className="relative">
                  {mic.listening && !reduce && (
                    <>
                      <motion.span className="absolute inset-0 rounded-full bg-accent" animate={{ scale: [1, 1.6], opacity: [0.5, 0] }} transition={{ duration: 1.2, repeat: Infinity }} aria-hidden />
                      <motion.span className="absolute inset-0 rounded-full bg-accent" animate={{ scale: [1, 1.6], opacity: [0.5, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.6 }} aria-hidden />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => (mic.listening ? mic.stop() : mic.start())}
                    disabled={!canListen || busy}
                    aria-pressed={mic.listening}
                    aria-label={mic.listening ? 'Stop listening' : 'Speak to Mission Companion'}
                    title={canListen ? undefined : 'Voice input needs Chrome or Edge. You can still type.'}
                    className={cx(
                      'relative grid size-12 place-items-center rounded-full transition active:scale-[0.96] disabled:opacity-50',
                      mic.listening ? 'bg-accent text-on-accent' : 'bg-brand text-on-brand',
                    )}
                  >
                    {!canListen ? <MicrophoneSlash size={22} /> : mic.listening ? <Stop size={20} weight="fill" /> : <Microphone size={22} weight="fill" />}
                  </button>
                </div>
                <form onSubmit={onSubmit} className="flex flex-1 items-end gap-2">
                  <label htmlFor="companion-input" className="sr-only">
                    Message
                  </label>
                  <textarea
                    id="companion-input"
                    ref={inputRef}
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) onSubmit(e)
                    }}
                    placeholder={canListen ? 'Speak, or type here' : 'Type your question'}
                    className={inputClass + ' max-h-32 min-h-12 resize-none py-3'}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    aria-label="Attach a document to explain"
                    title="Attach a document to explain"
                    className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-surface hover:bg-surface-2 disabled:opacity-50"
                  >
                    <Paperclip size={18} />
                  </button>
                  <button
                    type="submit"
                    disabled={!text.trim() || busy}
                    aria-label="Send"
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition active:scale-[0.96] disabled:opacity-50"
                  >
                    <PaperPlaneRight size={18} weight="bold" />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    className="sr-only"
                    aria-label="Document to explain"
                    onChange={(e) => {
                      onFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </form>
              </div>
              {!canListen && <p className="text-xs text-muted">Voice input works in Chrome and Edge. Typing works everywhere.</p>}
              <Disclaimer />
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CompanionMessage({
  m,
  speaking,
  onReplay,
  onStop,
  onAsk,
}: {
  m: { reply: CompanionReply; done?: string; noVoice?: boolean }
  speaking: boolean
  onReplay: () => void
  onStop: () => void
  onAsk: (q: string) => void
}) {
  const r = m.reply
  return (
    <div className="grid gap-3">
      <div className="card grid gap-3 p-4">
        <p className="text-[15px] leading-relaxed">{r.reply}</p>
        {r.next_step && (
          <div className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm">
            <ArrowRight size={14} className="mt-1 shrink-0" aria-hidden />
            <span>
              <span className="font-medium">Next step: </span>
              {r.next_step}
            </span>
          </div>
        )}
        {m.done && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--st-available)' }}>
            <CheckCircle size={14} weight="fill" aria-hidden />
            {m.done}
          </p>
        )}
        {r.citations.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted">Sources ({r.citations.length})</summary>
            <div className="mt-2 grid gap-2">
              {r.citations.map((c) => (
                <div key={c.id} className="grid gap-0.5">
                  <p className="font-medium">{c.title}</p>
                  <SourceLink source={c} />
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <MetaChip meta={r.meta} />
          {speechOutputSupported() && (
            <button onClick={speaking ? onStop : onReplay} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-surface-2">
              {speaking ? <Stop size={12} weight="fill" aria-hidden /> : <SpeakerHigh size={12} aria-hidden />}
              {speaking ? 'Stop' : 'Play'}
            </button>
          )}
          {m.noVoice && <span className="text-xs text-muted">No voice installed for this language; reply shown as text.</span>}
        </div>
      </div>
      {r.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.suggestions.map((s) => (
            <button key={s} onClick={() => onAsk(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs hover:border-brand">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DocMessage({ d }: { d: DocExplanation }) {
  const e = d.explanation
  const lists: [string, string[]][] = [
    ['Key requirements', e.key_requirements],
    ['Deadlines', e.deadlines],
    ['Documents needed', e.documents_needed],
    ['Authorities named', e.authorities],
  ]
  return (
    <div className="card grid gap-3 p-4">
      <p className="inline-flex items-center gap-2 text-sm font-medium">
        <FileText size={16} aria-hidden />
        {d.filename}
      </p>
      <p className="text-[15px] leading-relaxed">{e.summary}</p>
      {lists.map(([label, items]) =>
        items.length ? (
          <div key={label} className="grid gap-1">
            <p className="text-xs font-medium text-muted">{label}</p>
            <ul className="grid list-disc gap-0.5 pl-5 text-sm">
              {items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {e.next_step && (
        <div className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm">
          <ArrowRight size={14} className="mt-1 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">Next step: </span>
            {e.next_step}
          </span>
        </div>
      )}
      {d.original_excerpt && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Original text (unchanged)</summary>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono leading-relaxed">{d.original_excerpt}</p>
        </details>
      )}
      <p className="text-xs text-muted">AI explanation of your document. The original is unchanged; rely on the original wording.</p>
      <MetaChip meta={d.meta} />
    </div>
  )
}
