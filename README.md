# ASEAN Mission Control

AI-powered gateway to the ASEAN startup ecosystem, built for **Category A: Best Use of Gemma 4**.

A founder uploads their pitch deck or product screenshots, Gemma 4 builds a Founder DNA profile, and the platform generates a personalised **Country Launch Passport** (company setup, foreign investment, licences, tax, incentives, hiring, IP, data protection), a gap check, a dependency-aware roadmap, ecosystem matches, a consultation pack for the right authority, market comparison, a regulatory radar, an ASEAN Ecosystem Map (3D globe and flat map with pins), and **Mission Companion**, a multilingual voice co-pilot.

Demo corridor: **Malaysia to Indonesia** (healthtech), with Singapore for comparison.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind v4, TanStack Query, Motion, react-globe.gl (three.js), d3-geo |
| Voice | Browser Web Speech API (speech-to-text) and speechSynthesis (text-to-speech) |
| Backend | FastAPI, SQLModel, BM25 retrieval; ingests PDF, Word, PowerPoint, Excel, CSV, text and images (incl. HEIC) |
| AI | Gemma 4 via the Gemini API (`google-genai`) |
| Database | Supabase Postgres (SQLite locally when `DATABASE_URL` is empty) |
| Hosting | Vercel (static frontend + FastAPI as a Python function under `/api`) |

## How Gemma 4 is used

- **Multimodal Founder DNA**: pitch-deck text plus slide and product images go to Gemma in one call (`backend/app/routers/founder.py`).
- **Closed-book regulatory reasoning**: passport, compare, consultation pack and assistant prompts only contain records retrieved from `backend/app/seed/regulatory.json`. The backend drops any item that cites a record Gemma was not given and restores skipped ones as "source pending" (`backend/app/services.py`).
- **Structured output**: Gemma returns JSON that is validated with Pydantic; one repair call is made on failure (`backend/app/llm/gemma.py`).
- **Mission Companion**: context-aware, multilingual co-pilot (`backend/app/routers/companion.py`). It knows the founder's profile, mission, open passport items, saved items and referrals, replies in the founder's language with citations, and can trigger one validated action (open a page, search opportunities, compare markets, save an item, check progress). It also explains uploaded documents and shows proactive nudges.
- **Resilience**: if the configured model errors or times out, calls fail over to the other Gemma 4 model and skip the failing one for 5 minutes. Voice replies use minimal thinking for lower latency. Each answer's chip shows which model replied.
- **No key, no problem**: without `GEMINI_API_KEY` every feature falls back to deterministic rule-based output and the UI labels it "Demo data".

## Run locally

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # macOS/Linux: .venv/bin/pip
cp .env.example .env                                 # add GEMINI_API_KEY
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to :8000
```

`GET /api/health` shows whether the app is live or in demo mode, and which Gemma 4 model was auto-selected (`GET /api/models` lists them). Set `GEMMA_MODEL` to pin one.

Tests: `cd backend && .venv/Scripts/python -m pytest`

## Voice support

Speech input uses the browser's Web Speech API (Chrome and Edge; Safari partially). Spoken replies use the voices installed on the device; if none exists for a language the reply is shown as text. Typing works everywhere.

## Deploy: Supabase + Vercel

1. **Supabase**: create a project, then copy the **Transaction pooler** connection string (Project Settings > Database, port 6543). Tables are created automatically on first request.
2. **Vercel**: import the repo with the project root at the repository root (`vercel.json` builds `frontend/` and serves `api/index.py`). Set environment variables:
   - `GEMINI_API_KEY`
   - `DATABASE_URL` (the Supabase pooler URL)
   - `GEMMA_MODEL` (optional)
   - `CORS_ORIGINS` (optional; same-origin requests do not need it)
3. Uploads are capped at 4 MB to stay under Vercel's request body limit. Function `maxDuration` is 60 s.

Without `DATABASE_URL` on Vercel the API falls back to SQLite in `/tmp`, which does not persist between invocations.

## Data honesty

- Regulatory records point to official authority sites and are marked **"Seeded source, not yet reviewed"** until a professional verifies them.
- Partners, talent and some opportunities are **illustrative samples** and labelled as such in the UI.
- Regulatory Radar uses sample version histories, not live monitoring.
- There is no authentication yet: records are scoped by random IDs stored in the browser. Add Supabase Auth before real users.
- The platform gives guidance, not legal, tax or immigration advice.

## Layout

```
api/index.py          Vercel entrypoint (imports backend/app/main.py)
backend/app/          FastAPI app: routers, llm (Gemma wrapper, prompts, rule fallbacks), engine, seed data
backend/tests/        pytest suite
frontend/src/         React app: routes, components, 3D twin
vercel.json           Build + routing for Vercel
```
