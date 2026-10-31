import {
  ArrowRight,
  ArrowSquareOut,
  Broadcast,
  Compass,
  Fingerprint,
  GitBranch,
  Globe,
  Handshake,
  IdentificationBadge,
  Moon,
  Scales,
  Sun,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { ButtonLink, StatusBadge, cx } from '../components/ui'
import { useTheme } from '../lib/session'
import { useCountries } from '../geo/asean'
import { STATIC_NODES } from '../geo/nodes'
import { hasWebGL } from '../geo/webgl'

const GlobeView = lazy(() => import('../geo/GlobeView'))
const EASE = [0.16, 1, 0.3, 1] as const

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

const SOURCES = [
  ['Indonesia', 'OSS and BKPM', 'https://oss.go.id'],
  ['Indonesia', 'Ministry of Health', 'https://www.kemkes.go.id'],
  ['Indonesia', 'DJKI', 'https://www.dgip.go.id'],
  ['Malaysia', 'SSM', 'https://www.ssm.com.my'],
  ['Malaysia', 'MIDA', 'https://www.mida.gov.my'],
  ['Malaysia', 'JPDP', 'https://www.pdp.gov.my'],
  ['Singapore', 'ACRA', 'https://www.acra.gov.sg'],
  ['Singapore', 'HSA', 'https://www.hsa.gov.sg'],
  ['Singapore', 'PDPC', 'https://www.pdpc.gov.sg'],
  ['ASEAN', 'ASEAN IP Portal', 'https://www.aseanip.org'],
]

export default function Landing() {
  const { theme, toggle } = useTheme()
  const reduce = useReducedMotion()
  const webgl = useMemo(() => hasWebGL(), [])
  const geo = useCountries()

  return (
    <div className="min-h-[100dvh] bg-bg text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 md:px-8">
          <Link to="/" aria-label="ASEAN Mission Control home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="ml-6 hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#modules" className="hover:text-ink">Modules</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#sources" className="hover:text-ink">Sources</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} className="rounded-full p-2 hover:bg-surface-2">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <ButtonLink to="/app/onboard" className="hidden sm:inline-flex">Start your passport</ButtonLink>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 pb-16 pt-12 md:px-8 md:pt-20 lg:grid-cols-[1fr_1.1fr] lg:pb-24">
        <div className="grid gap-7">
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            className="text-4xl font-semibold leading-[1.05] tracking-tighter md:text-5xl lg:text-6xl"
          >
            Your next ASEAN market, mapped step by step.
          </motion.h1>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
            className="max-w-[46ch] text-lg leading-relaxed text-muted"
          >
            Gemma 4 reads your pitch deck, checks it against official sources, and plans your launch into a new ASEAN market.
          </motion.p>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
            className="flex flex-wrap gap-3"
          >
            <ButtonLink to="/app/onboard" className="px-6 py-3 text-base">
              Start your passport
              <ArrowRight size={18} aria-hidden />
            </ButtonLink>
            <ButtonLink to="/app/map" variant="ghost" className="px-6 py-3 text-base">
              Explore the map
            </ButtonLink>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.15, ease: EASE }}
          className="relative h-[380px] overflow-hidden rounded-[28px] bg-brand md:h-[520px]"
        >
          {webgl && geo.features ? (
            <Suspense fallback={<div className="skeleton absolute inset-0 rounded-none opacity-30" />}>
              <GlobeView
                graph={{ nodes: STATIC_NODES, mission: { origin: 'MY', target: 'ID', objective: '', legs: [] } }}
                features={geo.features}
                interactive={false}
                autoRotate
                showClusters={false}
                reduceMotion={!!reduce}
              />
            </Suspense>
          ) : null}
          {/* Real component preview, not a mock screenshot */}
          <div className="absolute bottom-4 left-4 right-4 z-20 grid gap-3 rounded-2xl border border-white/10 bg-brand-deep/90 p-4 text-on-brand backdrop-blur md:bottom-6 md:left-6 md:right-auto md:w-[300px]">
            <p className="text-xs text-on-brand/70">Malaysia to Indonesia, healthtech</p>
            <p className="font-medium leading-snug">Medical device and health software marketing authorisation</p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="professional_review_required" />
              <StatusBadge status="information_missing" />
            </div>
            <p className="font-mono text-[11px] text-on-brand/60">Source: Ministry of Health (Kemenkes)</p>
          </div>
        </motion.div>
      </section>

      {/* Problem statement */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
          <Reveal>
            <h2 className="max-w-[18ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Finding the opportunity is the easy part.
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="grid gap-5 text-base leading-relaxed text-muted">
            <p>
              A founder spots a hospital pilot in Jakarta. Then come the questions: which entity, which licence, which tax registration, can patient data leave the country, who signs the work permit.
            </p>
            <p>
              The answers sit across a dozen agency websites. Mission Control connects the opportunity with the requirements and people needed to pursue it.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Modules bento */}
      <section id="modules" className="mx-auto max-w-[1280px] px-4 py-20 md:px-8 md:py-28">
        <Reveal>
          <h2 className="mb-10 max-w-[22ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Eight modules, one connected mission.
          </h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-6">
          <Bento className="md:col-span-4 md:row-span-2 bg-brand text-on-brand" icon={<IdentificationBadge size={22} />} title="Borderless Launchpad" dark>
            <p className="max-w-[48ch] text-on-brand/80">
              A Country Launch Passport covering establishment, foreign investment, licences, tax, incentives, hiring, IP and data protection. Every item names its source and the authority responsible.
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {(['information_available', 'action_required', 'professional_review_required', 'information_missing'] as const).map((s) => (
                <div key={s} className="rounded-xl bg-white/6 p-3">
                  <StatusBadge status={s} />
                </div>
              ))}
            </div>
          </Bento>
          <Bento className="md:col-span-2 bg-accent text-on-accent" icon={<Fingerprint size={22} />} title="Founder DNA" accent>
            <p>Gemma 4 reads decks, screenshots and PDFs to learn what you actually do and what data you touch.</p>
          </Bento>
          <Bento className="md:col-span-2" icon={<GitBranch size={22} />} title="Dependency roadmap">
            <p>Steps ordered by what each requirement waits on, with parallel lanes where work can overlap.</p>
          </Bento>
          <Bento className="md:col-span-3" icon={<Compass size={22} />} title="Discover and Serendipity">
            <p>Programmes, funding, partners and talent ranked for your mission, each with the reason it fits.</p>
          </Bento>
          <Bento className="md:col-span-3 bg-brand-soft" icon={<Handshake size={22} />} title="Market Access Desk">
            <p>The right agency or adviser for each question, plus a consultation pack you review before sharing.</p>
          </Bento>
          <Bento className="md:col-span-2" icon={<Scales size={22} />} title="Compare markets">
            <p>Differences, unknowns and trade-offs side by side. No made-up rankings.</p>
          </Bento>
          <Bento className="md:col-span-2" icon={<Broadcast size={22} />} title="Regulatory Radar">
            <p>Source changes tracked from announced to enacted to effective, flagged against your missions.</p>
          </Bento>
          <Bento className="md:col-span-2 bg-brand-deep text-on-brand" icon={<Globe size={22} />} title="Ecosystem Map" dark>
            <p className="text-on-brand/80">A globe and map of ASEAN with pins for agencies, programmes, partners and talent. Mission Mode draws your route.</p>
          </Bento>
        </div>
      </section>

      {/* How it works: sticky heading + list */}
      <section id="how" className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-4 py-20 md:grid-cols-[1fr_1.4fr] md:px-8 md:py-28">
          <div className="md:sticky md:top-28 md:self-start">
            <h2 className="max-w-[16ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">From pitch deck to first consultation.</h2>
          </div>
          <ol className="grid gap-4">
            {[
              ['Upload', 'Drop in your deck, product screenshots or company profile. Gemma 4 builds your Founder DNA and asks what it could not find.'],
              ['Set the mission', 'Choose a target market and describe the goal: a hospital pilot, a regional office, local hires.'],
              ['Read your passport', 'Requirements matched to your activities, each with a status, a next step and the official source behind it.'],
              ['Act on it', 'Follow the roadmap, shortlist partners and funding, and take a prepared package to the right authority or adviser.'],
            ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 0.06}>
                <li className="card grid gap-2 p-6 md:grid-cols-[180px_1fr] md:gap-6">
                  <p className="text-lg font-semibold tracking-tight">{t}</p>
                  <p className="leading-relaxed text-muted">{b}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Sources */}
      <section id="sources" className="mx-auto max-w-[1280px] px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">
          <Reveal className="grid gap-4">
            <h2 className="max-w-[18ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">Grounded in official sources, not model memory.</h2>
            <p className="max-w-[52ch] leading-relaxed text-muted">
              Gemma 4 only sees requirement records retrieved from national authorities. Answers that cite anything else are dropped. Every record shows when it was last reviewed.
            </p>
            <p className="max-w-[52ch] text-sm leading-relaxed text-muted">
              Mission Control gives guidance, not legal, tax or immigration advice, and points you to the people who can.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map(([country, name, url]) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="card flex items-center justify-between gap-3 px-4 py-3 transition hover:border-brand">
                <span className="grid">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-muted">{country}</span>
                </span>
                <ArrowSquareOut size={16} className="shrink-0 text-muted" aria-hidden />
              </a>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-4 pb-16 md:px-8">
        <div className="mx-auto grid max-w-[1280px] gap-6 rounded-[28px] bg-brand px-6 py-14 text-on-brand md:grid-cols-[1.4fr_1fr] md:items-center md:px-14">
          <h2 className="max-w-[20ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Try it with the sample healthtech startup in two minutes.
          </h2>
          <div className="flex md:justify-end">
            <ButtonLink to="/app/onboard" className="px-6 py-3 text-base">
              Start your passport
              <ArrowRight size={18} aria-hidden />
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between md:px-8">
          <Logo />
          <p>Built with Gemma 4 for the ASEAN startup ecosystem.</p>
        </div>
      </footer>
    </div>
  )
}

function Bento({ className, icon, title, children, dark, accent }: { className?: string; icon: ReactNode; title: string; children: ReactNode; dark?: boolean; accent?: boolean }) {
  return (
    <Reveal className={cx('card flex flex-col gap-4 p-6 md:p-7', className, (dark || accent) && 'border-transparent')}>
      <span className={cx('grid size-10 place-items-center rounded-xl', dark ? 'bg-accent text-on-accent' : accent ? 'bg-brand text-on-brand' : 'bg-brand-soft text-brand dark:text-accent')}>
        {icon}
      </span>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <div className={cx('text-sm leading-relaxed', !dark && !accent && 'text-muted')}>{children}</div>
    </Reveal>
  )
}
