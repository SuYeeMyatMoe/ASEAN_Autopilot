import { useCallback, useEffect, useRef, useState } from 'react'

/** Languages the Companion offers, with the BCP-47 tags used for speech in and out. */
export const COMPANION_LANGS = [
  { code: 'auto', label: 'Match my language', bcp: '' },
  { code: 'en', label: 'English', bcp: 'en-US' },
  { code: 'ms', label: 'Bahasa Melayu', bcp: 'ms-MY' },
  { code: 'id', label: 'Bahasa Indonesia', bcp: 'id-ID' },
  { code: 'th', label: 'ไทย', bcp: 'th-TH' },
  { code: 'vi', label: 'Tiếng Việt', bcp: 'vi-VN' },
  { code: 'fil', label: 'Filipino', bcp: 'fil-PH' },
  { code: 'km', label: 'ខ្មែរ', bcp: 'km-KH' },
  { code: 'lo', label: 'ລາວ', bcp: 'lo-LA' },
  { code: 'my', label: 'မြန်မာ', bcp: 'my-MM' },
  { code: 'zh', label: '中文', bcp: 'zh-CN' },
  { code: 'ta', label: 'தமிழ்', bcp: 'ta-MY' },
] as const

export const bcpFor = (code: string) =>
  COMPANION_LANGS.find((l) => l.code === code)?.bcp || (typeof navigator !== 'undefined' ? navigator.language : 'en-US')

/* ---------- Speech-to-text (Web Speech API) ---------- */
interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => RecognitionLike) | null
}

export const speechInputSupported = () => typeof window !== 'undefined' && !!getRecognitionCtor()

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings, or type instead.',
  'service-not-allowed': 'Voice input is not available in this browser. Type your question instead.',
  'no-speech': "I didn't catch that. Tap the mic and try again.",
  'audio-capture': 'No microphone found. Check your device, or type instead.',
  network: 'Voice recognition needs a network connection. Type instead, or try again.',
  'language-not-supported': 'Voice input does not support this language in your browser yet. Type instead.',
}

export function useSpeechInput(lang: string, onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const rec = useRef<RecognitionLike | null>(null)
  const finalText = useRef('')
  const onFinalRef = useRef(onFinal)
  useEffect(() => {
    onFinalRef.current = onFinal
  })

  const stop = useCallback(() => rec.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError(ERRORS['service-not-allowed'])
      return
    }
    rec.current?.abort()
    const r = new Ctor()
    r.lang = lang
    r.interimResults = true
    r.continuous = false
    finalText.current = ''
    setInterim('')
    setError('')
    r.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText.current += res[0].transcript
        else live += res[0].transcript
      }
      setInterim((finalText.current + ' ' + live).trim())
    }
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'Voice input stopped unexpectedly. Try again or type instead.')
    }
    r.onend = () => {
      setListening(false)
      const text = finalText.current.trim()
      setInterim('')
      if (text) onFinalRef.current(text)
    }
    rec.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setError('Voice input could not start. Try again.')
    }
  }, [lang])

  useEffect(() => () => rec.current?.abort(), [])
  return { listening, interim, error, start, stop, clearError: () => setError('') }
}

/* ---------- Text-to-speech (speechSynthesis) ---------- */
export const speechOutputSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice(bcp: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const base = bcp.split('-')[0].toLowerCase()
  return (
    voices.find((v) => v.lang.toLowerCase() === bcp.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  )
}

export function useSpeechOutput() {
  const [speakingId, setSpeakingId] = useState<string | null>(null)

  useEffect(() => {
    if (!speechOutputSupported()) return
    // Voices load asynchronously in Chrome.
    window.speechSynthesis.getVoices()
    return () => window.speechSynthesis.cancel()
  }, [])

  /** Returns false when no voice exists for the language, so the UI can say so. */
  const speak = useCallback((id: string, text: string, bcp: string): boolean => {
    if (!speechOutputSupported()) return false
    const voice = pickVoice(bcp)
    if (!voice && !bcp.toLowerCase().startsWith('en')) return false
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = voice?.lang ?? bcp
    if (voice) u.voice = voice
    u.rate = 1
    u.onend = () => setSpeakingId((s) => (s === id ? null : s))
    u.onerror = () => setSpeakingId((s) => (s === id ? null : s))
    setSpeakingId(id)
    window.speechSynthesis.speak(u)
    return true
  }, [])

  const stopSpeaking = useCallback(() => {
    if (speechOutputSupported()) window.speechSynthesis.cancel()
    setSpeakingId(null)
  }, [])

  return { speak, stopSpeaking, speakingId }
}
