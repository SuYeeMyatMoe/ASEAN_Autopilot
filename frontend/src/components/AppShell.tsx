import {
  Fingerprint,
  GlobeHemisphereEast,
  Handshake,
  IdentificationBadge,
  List,
  ListChecks,
  Moon,
  Scales,
  Sun,
  Target,
  Waveform,
  X,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { preloadMap, preloadMapWhenIdle } from '../geo/preload'
import { api, COUNTRY_NAMES } from '../lib/api'
import { useSession, useTheme } from '../lib/session'
import { CompanionPanel } from './CompanionPanel'
import { FlowNav } from './FlowNav'
import { Logo } from './Logo'
import { cx } from './ui'

const NAV = [
  {
    group: 'Understand',
    items: [
      { to: '/app/onboard', label: 'Founder DNA', icon: Fingerprint },
      { to: '/app/mission', label: 'Mission', icon: Target },
    ],
  },
  {
    group: 'Borderless Launchpad',
    items: [
      { to: '/app/passport', label: 'Launch Passport', icon: IdentificationBadge },
      { to: '/app/plan', label: 'Launch plan', icon: ListChecks },
      { to: '/app/compare', label: 'Compare markets', icon: Scales },
    ],
  },
  {
    group: 'Ecosystem',
    items: [
      { to: '/app/desk', label: 'Market desk', icon: Handshake },
      { to: '/app/map', label: 'Ecosystem Map', icon: GlobeHemisphereEast },
    ],
  },
]

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="App" className="grid gap-6">
      {NAV.map((g) => (
        <div key={g.group} className="grid gap-1">
          <p className="px-3 pb-1 text-xs font-medium text-on-brand/60">{g.group}</p>
          {g.items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              // Start downloading the map as soon as the pointer or focus lands on its link.
              onPointerEnter={to === '/app/map' ? preloadMap : undefined}
              onFocus={to === '/app/map' ? preloadMap : undefined}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
                  isActive ? 'bg-accent font-medium text-on-accent' : 'text-on-brand/85 hover:bg-white/8 hover:text-on-brand',
                )
              }
            >
              <Icon size={18} weight="regular" aria-hidden />
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function AppShell() {
  const { theme, toggle } = useTheme()
  const { missionId } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const closeCompanion = useCallback(() => setAskOpen(false), [])
  const reduce = useReducedMotion()
  const location = useLocation()
  useEffect(preloadMapWhenIdle, [])

  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 })
  const mission = useQuery({ queryKey: ['mission', missionId], queryFn: () => api.mission(missionId!), enabled: !!missionId })
  const m = mission.data?.mission

  return (
    <div className="min-h-[100dvh] bg-bg lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-8 overflow-y-auto bg-brand px-4 py-6 text-on-brand lg:flex">
        <Link to="/" className="px-3">
          <Logo inverted />
        </Link>
        <Nav />
        <div className="mt-auto grid gap-1 px-3 text-xs text-on-brand/70">
          <span className="font-mono">{health.data ? (health.data.mode === 'live' ? `Gemma 4 live` : 'Demo mode, no API key') : 'Connecting'}</span>
          {health.data?.model && <span className="truncate font-mono" title={health.data.model}>{health.data.model}</span>}
          {health.data?.scan_model && (
            <span className="truncate font-mono" title="Uploaded files are scanned by this Gemini model">
              Scan: {health.data.scan_model}
            </span>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur md:px-8">
          <button className="rounded-full p-2 hover:bg-surface-2 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <List size={20} />
          </button>
          <Link to="/" className="lg:hidden">
            <Logo compact />
          </Link>
          {m ? (
            <Link to="/app/mission" className="hidden min-w-0 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm md:flex">
              <Target size={16} aria-hidden className="shrink-0" />
              <span className="font-medium">
                {COUNTRY_NAMES[m.origin] ?? m.origin} to {COUNTRY_NAMES[m.target] ?? m.target}
              </span>
              <span className="truncate text-muted">{m.objective}</span>
            </Link>
          ) : (
            <span className="hidden text-sm text-muted md:block">No active mission</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} className="rounded-full p-2 hover:bg-surface-2" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8 md:py-10"
        >
          <Outlet />
          <FlowNav />
        </motion.main>
      </div>

      {/* Mobile nav */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
            <motion.aside
              initial={reduce ? false : { x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              className="absolute inset-y-0 left-0 flex w-[280px] flex-col gap-8 overflow-y-auto bg-brand px-4 py-6 text-on-brand"
            >
              <div className="flex items-center justify-between px-3">
                <Logo inverted />
                <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-full p-2 hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>
              <Nav onNavigate={() => setMenuOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Mission Companion launcher */}
      <AnimatePresence>
        {!askOpen && (
          <motion.button
            initial={reduce ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setAskOpen(true)}
            aria-label="Open Mission Companion"
            className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-brand py-3 pl-3 pr-5 text-sm font-medium text-on-brand shadow-card ring-4 ring-accent/40 transition hover:bg-brand-deep active:scale-[0.97]"
          >
            <span className="grid size-8 place-items-center rounded-full bg-accent text-on-accent">
              <Waveform size={18} weight="bold" aria-hidden />
            </span>
            Ask Companion
          </motion.button>
        )}
      </AnimatePresence>

      <CompanionPanel open={askOpen} onClose={closeCompanion} />
    </div>
  )
}
