export type Status =
  | 'information_available'
  | 'action_required'
  | 'professional_review_required'
  | 'information_missing'
  | 'source_verification_pending'

export interface GenMeta {
  source: 'gemma' | 'demo' | 'fallback'
  model: string | null
  notes: string[]
  /** Gemini model that scanned the uploaded files into text, if any. */
  scan_model?: string | null
}

export interface FounderDNA {
  company_name: string
  origin_country: string
  industry: string
  sector: string
  business_model: string
  business_activities: string[]
  stage: string
  team_size: number | null
  hiring_plans: string
  products: string[]
  data_handling: string[]
  processes_sensitive_data: boolean
  ownership_notes: string
  existing_registrations: string[]
  ip_assets: string[]
  expansion_objectives: string[]
  target_countries: string[]
  follow_up_questions: string[]
  materials_summary?: string
}

export interface Mission {
  id: string
  founder_id: string
  origin: string
  target: string
  objective: string
  sector: string
  created_at: string
}

export interface FounderResponse {
  founder_id: string
  dna: FounderDNA
  meta: GenMeta & { files?: string[] }
  missions?: Mission[]
}

export interface Source {
  id: string
  title: string
  authority: string
  source_url: string
  verification_status: string
  last_verified: string | null
}

export interface PassportItem {
  record_id: string
  applies: boolean
  why_it_applies: string
  status: Status
  evidence_available: string[]
  missing: string[]
  next_action: string
  area: string
  area_name: string
  category: string
  title: string
  summary: string
  authority: string
  source_url: string
  instrument: string
  verification_status: string
  last_verified: string | null
  effective_date: string | null
  country: string
}

export interface PassportResponse {
  passport_id: string
  mission_id: string
  summary: string
  items: PassportItem[]
  missing_information: string[]
  recommended_next_actions: string[]
  status_counts: Partial<Record<Status, number>>
  meta: GenMeta
  created_at: string
}

export interface RoadmapStep {
  record_id: string
  title: string
  area: string
  authority: string
  waits_for: string[]
  depends_on_structure: boolean
  status: Status
  next_action: string
}

export interface RoadmapStage {
  index: number
  label: string
  parallel: boolean
  steps: RoadmapStep[]
}

export interface EcoItem {
  id: string
  kind: 'programme' | 'funding' | 'partner' | 'talent'
  country: string
  name: string
  provider?: string
  summary: string
  industries: string[]
  capabilities?: string[]
  url?: string | null
  sample: boolean
  fit: 'high' | 'medium' | 'low'
  reason: string
}

export interface CompareCell {
  highlight: string
  unknowns: string[]
  sources: Source[]
}

export interface CompareResponse {
  countries: { code: string; name: string }[]
  areas: Record<string, string>
  grid: Record<string, Record<string, CompareCell>>
  trade_offs: string[]
  open_questions: string[]
  meta: GenMeta
}

export interface Referral {
  id: string
  country: string
  type: 'government' | 'professional'
  name: string
  areas: string[]
  url: string | null
  channel: string
  services: string[]
}

export interface ConsultPack {
  issue_summary: string
  founder_profile: string
  business_activities: string[]
  questions_to_ask: string[]
  documents_to_bring: string[]
  missing_information: string[]
  sources: Source[]
  referrals: Referral[]
  question: string
}

export interface ReferralRequest {
  id: string
  mission_id: string
  referral_id: string
  status: string
  referral: Referral | null
  pack?: ConsultPack
  updated_at: string
}

export interface RadarVersion {
  version: number
  stage: 'announced' | 'enacted' | 'effective'
  date: string
  text: string
}

export interface RadarItem {
  id: string
  record_id: string
  country: string
  area: string
  sample: boolean
  versions: RadarVersion[]
  record: Source
}

export interface RadarDiff {
  diff: { summary: string; what_changed: string[]; stage_change: string; review_tasks: string[]; recommend_professional: boolean }
  old: RadarVersion
  new: RadarVersion
  record: Source
  affected_missions: { mission_id: string; objective: string; target: string }[]
  meta: GenMeta
}

export interface CompanionAction {
  type: 'none' | 'open_page' | 'search_opportunities' | 'compare_markets' | 'save_opportunity' | 'check_progress'
  params: { page?: string; kinds?: string[]; countries?: string[]; id?: string }
  label: string
}

export interface CompanionReply {
  reply: string
  language: string
  next_step: string
  /** App page (e.g. 'gaps') where the next step happens; empty when none. */
  next_page: string
  citations: Source[]
  action: CompanionAction
  suggestions: string[]
  meta: GenMeta
}

export interface CompanionNudge {
  kind: 'start' | 'missing' | 'review' | 'next' | 'followup' | 'radar'
  text: string
  page: string
}

export interface DocExplanation {
  explanation: {
    summary: string
    language: string
    key_requirements: string[]
    deadlines: string[]
    documents_needed: string[]
    authorities: string[]
    next_step: string
  }
  filename: string
  original_excerpt: string
  meta: GenMeta
}

export interface Milestone {
  id: string
  kind: string
  label: string
  ref_id: string | null
  created_at: string
}

export interface TwinNode {
  id: string
  kind: 'country'
  label: string
  lat: number
  lon: number
  covered: boolean
  counts: { records: number; agencies: number; opportunities: number }
}

export interface MapPin {
  id: string
  label: string
  kind: 'agency' | 'programme' | 'funding' | 'partner' | 'talent'
  country: string
  city: string
  lat: number
  lon: number
  sample: boolean
  url: string | null
}

export interface TwinGraph {
  nodes: TwinNode[]
  pins: MapPin[]
  mission: null | {
    origin: string
    target: string
    objective: string
    legs: { stage: string; items: { id: string; label: string; status?: Status; kind?: string; sample?: boolean }[] }[]
  }
}

export interface Health {
  ok: boolean
  mode: 'live' | 'demo'
  model: string | null
  model_error: string | null
  scan_model: string | null
  database: string
  /** false when the server keeps data in temporary storage (no DATABASE_URL on Vercel) */
  persistent?: boolean
  build?: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? ''

/**
 * A copy of this browser's founder, mission and latest passport. If the server answers 404
 * because it lost them (temporary storage on a serverless instance), they are restored
 * under the same ids and the request is retried once.
 */
type Snapshot = { founder?: FounderResponse; mission?: Mission; passport?: PassportResponse }
const SNAPSHOT_KEY = 'amc-snapshot'

function readSnapshot(): Snapshot {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? '{}') as Snapshot
  } catch {
    return {}
  }
}

function remember(patch: Snapshot) {
  try {
    const next = { ...readSnapshot(), ...patch }
    // A new mission makes the old passport irrelevant.
    if (patch.mission && next.passport && next.passport.mission_id !== patch.mission.id) delete next.passport
    if (patch.founder && next.mission && next.mission.founder_id !== patch.founder.founder_id) {
      delete next.mission
      delete next.passport
    }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next))
  } catch {
    /* storage full or unavailable: restore just won't be possible */
  }
}

const keep =
  <T,>(pick: (v: T) => Snapshot) =>
  (v: T) => {
    remember(pick(v))
    return v
  }

let restoring: Promise<boolean> | null = null

/**
 * Re-seed the server from the snapshot. Resolves true when the server accepted it, even if it
 * already had everything: a request that was in flight while another one restored the data
 * still got a 404 and should be retried (once).
 */
function restoreFromSnapshot(): Promise<boolean> {
  const snap = readSnapshot()
  if (!snap.founder && !snap.mission) return Promise.resolve(false)
  restoring ??= fetch(`${BASE}/api/restore`, json({ founder: snap.founder ?? null, mission: snap.mission ?? null, passport: snap.passport ?? null }))
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (restoring = null), 0))
  return restoring
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, init)
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check that the API is running and try again.')
  }
  if (res.status === 404 && !retried && (await restoreFromSnapshot())) {
    return request<T>(path, init, true)
  }
  if (!res.ok) {
    let msg =
      res.status === 504
        ? 'The server took too long to answer. Please try again; Gemma 4 is usually faster on the next try.'
        : `Request failed (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') msg = body.detail
      if (msg === 'Mission not found.') msg = 'This mission is no longer stored on the server. Open Mission and set it up again.'
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<Health>('/health'),
  extractFounder: (files: File[], notes: string) => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    fd.append('notes', notes)
    return request<FounderResponse>('/founder/extract', { method: 'POST', body: fd }).then(keep((f) => ({ founder: f })))
  },
  sampleFounder: () => request<FounderResponse>('/founder/sample', { method: 'POST' }).then(keep((f) => ({ founder: f }))),
  founder: (id: string) => request<FounderResponse>(`/founder/${id}`).then(keep((f) => ({ founder: f }))),
  updateFounder: (id: string, dna: FounderDNA) =>
    request<FounderResponse>(`/founder/${id}`, json(dna, 'PATCH')).then(keep((f) => ({ founder: f }))),
  createMission: (body: { founder_id: string; target: string; objective: string }) =>
    request<Mission>('/mission', json(body)).then(keep((m) => ({ mission: m }))),
  mission: (id: string) =>
    request<{ mission: Mission; founder: FounderResponse }>(`/mission/${id}`).then(keep((r) => ({ founder: r.founder, mission: r.mission }))),
  generatePassport: (missionId: string) =>
    request<PassportResponse>(`/passport/${missionId}`, { method: 'POST' }).then(keep((p) => ({ passport: p }))),
  passport: (missionId: string) => request<PassportResponse>(`/passport/${missionId}`).then(keep((p) => ({ passport: p }))),
  roadmap: (missionId: string) => request<{ stages: RoadmapStage[] }>(`/passport/${missionId}/roadmap`),
  discover: (missionId: string, kinds: string[]) =>
    request<{ results: EcoItem[]; meta: GenMeta }>('/discover', json({ mission_id: missionId, kinds })),
  compare: (founderId: string, countries: string[]) =>
    request<CompareResponse>('/compare', json({ founder_id: founderId, countries })),
  referrals: (country?: string) =>
    request<{ referrals: Referral[]; areas: Record<string, string> }>(`/referrals${country ? `?country=${country}` : ''}`),
  consultPack: (missionId: string, question: string, referralId?: string) =>
    request<{ pack: ConsultPack; meta: GenMeta }>('/referrals/consult-pack', json({ mission_id: missionId, question, referral_id: referralId })),
  saveRequest: (missionId: string, referralId: string, pack: ConsultPack) =>
    request<ReferralRequest>('/referrals/requests', json({ mission_id: missionId, referral_id: referralId, pack })),
  requests: (missionId: string) => request<{ requests: ReferralRequest[] }>(`/referrals/requests/${missionId}`),
  updateRequest: (id: string, status: string) => request<ReferralRequest>(`/referrals/requests/${id}`, json({ status }, 'PATCH')),
  radar: () => request<{ items: RadarItem[] }>('/radar'),
  radarDiff: (radarId: string, founderId?: string | null) =>
    request<RadarDiff>('/radar/diff', json({ radar_id: radarId, founder_id: founderId ?? null })),
  companionChat: (body: {
    message: string
    language: string
    mission_id?: string | null
    founder_id?: string | null
    page?: string
    history: { role: 'user' | 'companion'; text: string }[]
  }) => request<CompanionReply>('/companion/chat', json(body)),
  companionBrief: (missionId?: string | null, founderId?: string | null) => {
    const q = new URLSearchParams()
    if (missionId) q.set('mission_id', missionId)
    if (founderId) q.set('founder_id', founderId)
    return request<{ nudges: CompanionNudge[]; has_mission: boolean }>(`/companion/brief?${q}`)
  },
  companionDocument: (file: File, question: string, language: string, missionId?: string | null) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('question', question)
    fd.append('language', language)
    if (missionId) fd.append('mission_id', missionId)
    return request<DocExplanation>('/companion/document', { method: 'POST', body: fd })
  },
  milestones: (missionId: string) => request<{ milestones: Milestone[] }>(`/milestones/${missionId}`),
  addMilestone: (body: { mission_id: string; kind: string; label: string; ref_id?: string }) => request<Milestone>('/milestones', json(body)),
  removeMilestone: (id: string) => request<{ ok: boolean }>(`/milestones/${id}`, { method: 'DELETE' }),
  twin: (missionId?: string | null) => request<TwinGraph>(`/twin/graph${missionId ? `?mission_id=${missionId}` : ''}`),
}

export const COUNTRY_NAMES: Record<string, string> = {
  ID: 'Indonesia', MY: 'Malaysia', SG: 'Singapore', TH: 'Thailand', VN: 'Vietnam', PH: 'Philippines',
  KH: 'Cambodia', LA: 'Lao PDR', MM: 'Myanmar', BN: 'Brunei Darussalam', TL: 'Timor-Leste', ASEAN: 'ASEAN',
}
export const COVERED = ['ID', 'MY', 'SG']
