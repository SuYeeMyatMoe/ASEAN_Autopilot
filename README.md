# ASEAN Mission Control

AI-powered gateway to the ASEAN startup ecosystem, built with **Gemma 4**, with **Gemini** scanning uploaded files.

Upload a pitch deck, pick a target market, and get a sourced, step-by-step plan for launching your startup in another ASEAN country.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

- **Source code:** https://github.com/SuYeeMyatMoe/ASEAN_Autopilot
- **Licence:** [MIT](LICENSE)
- **Demo corridor:** Malaysia to Indonesia (healthtech), with Singapore for comparison

---

## Project Description

### Problem statement

**Category A: Best Use of Gemma 4.** Gemma 4 does all the reasoning: building the founder profile, matching regulations, planning, comparing markets and answering questions in many languages. Gemini is used only for one job before that: scanning uploaded files into text.

### The problem

Finding a market opportunity is the easy part. A Malaysian healthtech founder spots a hospital pilot in Jakarta. Then come the questions: which legal entity to set up, whether foreign ownership is allowed, which health licence applies, how to register for tax, whether patient data can leave the country, and who signs the work permit.

The answers are spread across a dozen government agency websites in different languages. Founders spend weeks and consultancy fees just to learn what they need to do and in what order. Generic chatbots make this worse because they answer from memory and can invent rules.

### Our solution

ASEAN Mission Control turns a pitch deck into a **Country Launch Passport**: a personalised checklist of what a startup must do to enter a new ASEAN market, where every item cites the official source and names the responsible authority. Around the passport it adds:

- a gap check and a dependency-aware launch roadmap
- matched programmes, funding, partners and talent
- a consultation pack for the right agency or adviser
- side-by-side market comparison
- a regulatory radar for rule changes
- an interactive ASEAN Ecosystem Map (3D globe and flat map)
- **Mission Companion**, a multilingual voice co-pilot

### How it works

1. **Upload and scan.** The founder uploads a pitch deck, product screenshots or company profile (PDF, Word, PowerPoint, Excel, CSV, text or images). **Gemini** scans the files into a faithful text transcript: it reads PDFs directly (including scanned pages), reads images and photos, and describes charts and screenshots.
2. **Profile.** **Gemma 4** reads the transcript and builds a **Founder DNA** profile: what the company does, what data it handles, and what is still unknown.
3. **Set the mission.** The founder picks a target country and a goal, such as a hospital pilot or a regional office.
4. **Retrieve.** The backend uses BM25 search to pull the matching official regulatory records from a curated, source-linked dataset.
5. **Reason, closed-book.** Gemma 4 receives only those records and returns structured JSON. Any item that cites a record Gemma was not given is dropped, so answers come from official sources rather than model memory.
6. **Plan.** A dependency engine orders the steps (for example, register the company before applying for a licence) and shows which can run in parallel.
7. **Act.** The founder follows the roadmap, shortlists partners and funding, prepares a consultation pack, and can ask Mission Companion questions by voice or text in 11 languages.

### Technologies and tools

| Layer | Tech |
|---|---|
| AI models | **Gemma 4** for all reasoning, **Gemini** (default `gemini-2.5-flash`) for scanning uploaded files, both via the Gemini API (`google-genai` SDK) |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, React Router, Motion |
| Maps | react-globe.gl (three.js), d3-geo, topojson |
| Voice | Browser Web Speech API (speech-to-text) and `speechSynthesis` (text-to-speech) |
| Backend | Python, FastAPI, SQLModel, Pydantic, rank-bm25 |
| Document ingestion | pypdf, python-docx, python-pptx, openpyxl, Pillow, pillow-heif |
| Database | Supabase Postgres in production, SQLite locally |
| Hosting | Vercel (static frontend and FastAPI as a Python serverless function) |
| Testing and linting | pytest, oxlint, TypeScript compiler |

### Target users

- **Startup founders and SMEs** in ASEAN planning their first cross-border expansion
- **Accelerators, incubators and investors** helping portfolio companies enter new markets
- **Government trade and investment agencies** that want founders to arrive better prepared
- **Lawyers, accountants and advisers**, who receive a structured consultation pack instead of starting from zero

### What makes it unique

- **Grounded, not guessed.** Gemma 4 only sees retrieved official records, every passport item links to its source, and anything it cannot back up is dropped or marked "source pending".
- **Starts from the founder's own material.** Gemini scans decks, scanned PDFs and screenshots into text and Gemma 4 turns it into a profile, so founders do not fill in long forms.
- **Plans, not just answers.** Requirements become an ordered roadmap with dependencies and parallel tracks, connected to opportunities and the people who can help.
- **Multilingual voice co-pilot.** Mission Companion knows the founder's mission, answers with citations in 11 languages (English, Malay, Indonesian, Thai, Vietnamese, Filipino, Khmer, Lao, Burmese, Chinese, Tamil), and can take actions in the app.
- **Honest by design.** Unreviewed sources, sample data and demo output are labelled in the UI. The app works without an API key using rule-based fallbacks.
- **Resilient.** If one Gemma 4 model errors or times out, calls fail over to another Gemma 4 model automatically.

---

## Getting Started

### Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer and npm
- A Google AI Studio API key ([get one here](https://aistudio.google.com/apikey)). The same key is used for Gemma 4 and Gemini. Optional: without it the app runs in demo mode.

### 1. Clone the repository

```bash
git clone https://github.com/SuYeeMyatMoe/ASEAN_Autopilot.git
```

```bash
cd ASEAN_Autopilot
```

### 2. Set up the backend

```bash
cd backend
python -m venv .venv
```

Install dependencies (macOS/Linux):

```bash
.venv/bin/pip install -r requirements-dev.txt
```

On Windows use `.venv\Scripts\pip install -r requirements-dev.txt`.

Create the environment file and add your key:

```bash
cp .env.example .env
```

### 3. Set up the frontend

```bash
cd frontend
npm install
```

### Environment variables

Set these in `backend/.env` locally, or in the Vercel project settings when deployed.

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | No | Google AI Studio key. Without it every feature uses rule-based demo output, labelled "Demo data". |
| `GEMMA_MODEL` | No | Gemma 4 model id. Default `gemma-4-26b-a4b-it` (mixture-of-experts, ~4B active parameters: much faster than the dense 31B with close quality). Blank auto-selects, still preferring the MoE model; the other Gemma 4 model is the automatic backup. |
| `GEMMA_BUDGET_MS` | No | Time budget for one Gemma answer, all attempts included. Default `40000`, well under the 300 s function limit, so a slow model returns the rule-based result instead of a 504. |
| `GEMINI_SCAN_MODEL` | No | Gemini model that scans uploaded files. Default `gemini-2.5-flash`, with `gemini-flash-latest` as backup. Set it to blank to skip scanning and let Gemma 4 read the files directly. |
| `DEMO_MODE` | No | `true` forces demo responses even when a key is set. |
| `DATABASE_URL` | No | Supabase Postgres transaction pooler URL (port 6543). Blank uses a local SQLite file. |
| `CORS_ORIGINS` | No | Comma-separated allowed origins. Default `*`. |

---

## Running the Project

Start the API (from `backend/`, macOS/Linux):

```bash
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

On Windows use `.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000`.

Start the web app (from `frontend/`):

```bash
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to port 8000.

**Quick tour:** on the landing page choose **Start your passport**, then load the sample healthtech startup to see the full Malaysia to Indonesia flow in about two minutes.

**Check the AI status:** `GET http://localhost:8000/api/health` shows whether the app is in live or demo mode, the selected Gemma 4 model, the Gemini scan model and the database in use. `GET /api/models` lists the Gemma 4 models available to your key.

### Tests, lint and build

Backend tests (from `backend/`):

```bash
.venv/bin/python -m pytest
```

Frontend lint and production build (from `frontend/`):

```bash
npm run lint
```

```bash
npm run build
```

### Deploy to Supabase and Vercel

1. **Supabase:** create a project and copy the **Transaction pooler** connection string (Project Settings > Database, port 6543). Tables are created automatically on the first request.
2. **Vercel:** import the repository with the project root at the repository root. `vercel.json` builds `frontend/` and serves `api/index.py` as the FastAPI function. Set `GEMINI_API_KEY`, `DATABASE_URL`, and optionally `GEMMA_MODEL`, `GEMINI_SCAN_MODEL` and `CORS_ORIGINS`.
3. Uploads are capped at 4 MB to stay under Vercel's request body limit. `vercel.json` turns on Fluid compute and sets the function `maxDuration` to 300 seconds (the Hobby maximum with Fluid compute), so passport generation is not cut off with a 504.

Without `DATABASE_URL` on Vercel, the API falls back to SQLite in `/tmp`, which is separate for each function instance and wiped on every deploy. The browser keeps a copy of its founder profile, mission and latest passport and re-sends them with the retried request (`X-AMC-Restore` header, gzip) when a request returns 404, so whichever instance serves the retry restores them first and pages keep working. If the browser has no copy either, the page offers Start over. `POST /api/restore` does the same as a separate call; but saved milestones and referral requests are lost. Set `DATABASE_URL` for real persistence; the sidebar shows "Temporary storage" until you do, and `/api/health` reports `persistent`.

---

## Technical Documentation

### Architecture

```
 Browser (React + Vite)
   |  pages: Onboard, Mission, Passport, Gaps, Roadmap, Compare,
   |         Discover, Market Desk, Radar, Ecosystem Map
   |  Mission Companion (Web Speech API voice in/out)
   v
 /api  ->  FastAPI (backend/app, served by api/index.py on Vercel)
   |-- ingest/      parse PDF, DOCX, PPTX, XLSX, CSV, text, images
   |-- llm/scanner.py  Gemini: scan uploads into a text transcript
   |-- retrieval.py BM25 search over seed/regulatory.json
   |-- llm/gemma.py Gemma 4 client: model selection, JSON validation,
   |                repair call, failover, timeouts
   |-- llm/rules.py deterministic fallbacks for demo mode
   |-- engine/      dependency roadmap (topological layering)
   |-- services.py  citation checks: drop uncited items, restore skipped
   |                ones as "source pending"
   v
 SQLModel  ->  Supabase Postgres (prod) / SQLite (local)
   |
   v
 Gemini API  ->  Gemini (file scanning)  ->  Gemma 4 (all reasoning)
```

### How Gemini and Gemma 4 work together

Uploaded files go through two steps:

1. **Gemini scans** (`backend/app/llm/scanner.py`). PDFs are sent as-is, so Gemini reads both text and scanned pages. Images are resized and sent as JPEG. Word, PowerPoint, Excel, CSV and text files are first parsed locally (Gemini cannot open Office files), and that text is sent along. Gemini returns a per-file transcript with tables as rows and short factual descriptions of charts and screenshots. It is told not to summarise, interpret or invent.
2. **Gemma 4 reasons** on that transcript to build the Founder DNA (`/founder/extract`) or explain a document (`/companion/document`). Everything after that (passport, roadmap, comparison, consultation pack, companion chat) is Gemma 4 only.

If Gemini is unavailable, or `GEMINI_SCAN_MODEL` is blank, the app falls back to sending the locally extracted text and images straight to Gemma 4, so uploads keep working. The result shows a "Scanned · model" chip next to the Gemma 4 chip when Gemini did the scan.

### How Gemma 4 is used

| Capability | Where | What it does |
|---|---|---|
| Founder DNA | `backend/app/routers/founder.py` | Builds the founder profile from Gemini's scan of the uploads (or from the deck text and images directly if scanning is off). |
| Closed-book regulatory reasoning | `backend/app/services.py`, `backend/app/llm/prompts.py` | Passport, compare, consultation pack and companion prompts contain only retrieved records. Items citing anything else are dropped. |
| Structured output | `backend/app/llm/gemma.py` | Gemma returns JSON validated with Pydantic, with one repair call on failure. The Launch Passport is assessed in three parallel Gemma 4 calls and merged. |
| Mission Companion | `backend/app/routers/companion.py` | Context-aware multilingual co-pilot. Knows the profile, mission, open items, saved items and referrals. Replies with citations and can trigger one validated action (open a page, search opportunities, compare markets, save an item, check progress). Also explains uploaded documents (scanned by Gemini first) and gives proactive nudges. |
| Resilience | `backend/app/llm/gemma.py` | On error or timeout, fails over to another Gemma 4 model and skips the failing one for 5 minutes. Every answer runs inside a time budget that stays well under the function limit. Voice replies use minimal thinking for lower latency. Each answer shows which model replied. |

### Dependency roadmap

`backend/app/engine/dependency.py` builds the roadmap from the `depends_on` links in each regulatory record. It groups steps into layers with Kahn's topological sort: every step in a layer can run in parallel once the previous layers are done. Links to records outside the founder's passport are ignored, and cycles raise an error.

### Data

| File | Contents |
|---|---|
| `backend/app/seed/regulatory.json` | 31 regulatory records for Indonesia, Malaysia, Singapore and ASEAN-wide rules, covering company registration, foreign investment, business and healthcare licensing, tax, incentives, immigration, employment, IP and data protection. Each links to the official authority. |
| `backend/app/seed/ecosystem.json` | Programmes, funding, partners, talent, referral contacts and regulatory radar histories used by Discover, Market Desk, Radar and the Ecosystem Map. |
| `backend/app/catalog.py` | The 11 ASEAN countries and requirement areas. ID, MY and SG have full coverage; the other countries appear on the map only. |

Database tables (`backend/app/models.py`): `Founder`, `Mission`, `Passport`, `ReferralRequest`, `Milestone`. They are created automatically on startup.

### API reference

All routes are under `/api`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Live or demo mode, selected model, database type |
| GET | `/meta` | Countries and requirement areas |
| GET | `/models` | Available Gemma 4 models |
| POST | `/founder/extract` | Upload files; Gemini scans them, Gemma 4 builds Founder DNA |
| POST | `/founder/sample` | Load the sample healthtech founder |
| GET, PATCH | `/founder/{founder_id}` | Read or edit a founder profile |
| POST | `/mission` | Create a mission (target country and goal) |
| GET | `/mission/{mission_id}` | Read a mission |
| POST, GET | `/passport/{mission_id}` | Generate or read the Country Launch Passport |
| GET | `/passport/{mission_id}/roadmap` | Dependency-ordered roadmap |
| POST | `/discover` | Ranked programmes, funding, partners and talent |
| POST | `/compare` | Side-by-side market comparison |
| GET | `/referrals` | Agencies and advisers, filtered by country and area |
| POST | `/referrals/consult-pack` | Generate a consultation pack |
| POST | `/referrals/requests` | Save a referral request |
| GET | `/referrals/requests/{mission_id}` | List referral requests |
| PATCH | `/referrals/requests/{request_id}` | Update a referral request |
| GET | `/radar` | Regulatory change timeline |
| POST | `/radar/diff` | Explain a change between record versions |
| GET | `/milestones/{mission_id}` | List milestones |
| POST | `/milestones` | Save a milestone |
| GET | `/twin/graph` | Ecosystem graph for the map |
| GET | `/companion/languages` | Supported companion languages |
| POST | `/companion/chat` | Chat with Mission Companion |
| GET | `/companion/brief` | Proactive nudges for the current mission |
| POST | `/companion/document` | Gemini scans an uploaded document, Gemma 4 explains it |

When the API is running, interactive docs are available at http://localhost:8000/docs.

### Voice support

Speech input uses the browser's Web Speech API (Chrome and Edge; Safari partially). Spoken replies use the voices installed on the device; if none exists for a language, the reply is shown as text. Typing works everywhere.

### Project layout

```
api/index.py              Vercel entrypoint (imports backend/app/main.py)
backend/app/main.py       FastAPI app, health and meta routes
backend/app/routers/      founder, passport, discover, desk, twin, companion
backend/app/llm/          Gemma 4 client, Gemini file scanner, prompts, rule-based fallbacks
backend/app/engine/       dependency roadmap
backend/app/ingest/       document parsing
backend/app/seed/         regulatory and ecosystem data
backend/tests/            pytest suite
frontend/src/routes/      app pages
frontend/src/components/  shared UI, Mission Companion panel
frontend/src/geo/         3D globe, flat map, hero network map
frontend/src/lib/         API client, speech, session state
ASEAN_*_Design/           design explorations for Market Desk and Launch Plan
vercel.json               build and routing for Vercel
LICENSE                   MIT licence
```

### Data honesty and limitations

- Regulatory records point to official authority sites and are marked **"Seeded source, not yet reviewed"** until a professional verifies them.
- Partners, talent and some opportunities are **illustrative samples** and are labelled as such in the UI.
- Regulatory Radar uses sample version histories, not live monitoring.
- There is no authentication yet: records are scoped by random IDs stored in the browser. Add Supabase Auth before real users.
- The platform gives guidance, not legal, tax or immigration advice.

---

## License

Released under the [MIT License](LICENSE).
