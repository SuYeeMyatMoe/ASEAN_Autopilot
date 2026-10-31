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

export interface AssistantAnswer {
  answer: string
  citations: Source[]
  needs_professional_review: boolean
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
  database: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, init)
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check that the API is running and try again.')
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') msg = body.detail
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
    return request<FounderResponse>('/founder/extract', { method: 'POST', body: fd })
  },
  sampleFounder: () => request<FounderResponse>('/founder/sample', { method: 'POST' }),
  founder: (id: string) => request<FounderResponse>(`/founder/${id}`),
  updateFounder: (id: string, dna: FounderDNA) => request<FounderResponse>(`/founder/${id}`, json(dna, 'PATCH')),
  createMission: (body: { founder_id: string; target: string; objective: string }) => request<Mission>('/mission', json(body)),
  mission: (id: string) => request<{ mission: Mission; founder: FounderResponse }>(`/mission/${id}`),
  generatePassport: (missionId: string) => request<PassportResponse>(`/passport/${missionId}`, { method: 'POST' }),
  passport: (missionId: string) => request<PassportResponse>(`/passport/${missionId}`),
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
  ask: (question: string, missionId?: string | null) =>
    request<AssistantAnswer>('/assistant', json({ question, mission_id: missionId ?? null })),
  milestones: (missionId: string) => request<{ milestones: Milestone[] }>(`/milestones/${missionId}`),
  addMilestone: (body: { mission_id: string; kind: string; label: string; ref_id?: string }) => request<Milestone>('/milestones', json(body)),
  twin: (missionId?: string | null) => request<TwinGraph>(`/twin/graph${missionId ? `?mission_id=${missionId}` : ''}`),
}

export const COUNTRY_NAMES: Record<string, string> = {
  ID: 'Indonesia', MY: 'Malaysia', SG: 'Singapore', TH: 'Thailand', VN: 'Vietnam', PH: 'Philippines',
  KH: 'Cambodia', LA: 'Lao PDR', MM: 'Myanmar', BN: 'Brunei Darussalam', TL: 'Timor-Leste', ASEAN: 'ASEAN',
}
export const COVERED = ['ID', 'MY', 'SG']
