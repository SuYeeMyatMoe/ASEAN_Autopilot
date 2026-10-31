import { loadCountries } from './asean'
import { hasWebGL } from './webgl'

/**
 * The Ecosystem Map needs the page code, the country outlines and the globe renderer
 * (three.js, ~550 kB gzipped). Fetching them one after another made the page sit on a
 * blank skeleton, so every loader here is memoised and can start in parallel, ahead of time.
 */
const once = <T,>(fn: () => Promise<T>) => {
  let p: Promise<T> | null = null
  return () => (p ??= fn().catch((e) => ((p = null), Promise.reject(e))))
}

export const loadMapPage = once(() => import('../routes/MapPage'))
export const loadGlobeView = once(() => import('./GlobeView'))
export const loadMapView = once(() => import('./MapView'))

let webgl: boolean | null = null
export const canUseWebGL = () => (webgl ??= hasWebGL())

/** Start every download the map needs. Safe to call many times. */
export function preloadMap() {
  void loadMapPage().catch(() => {})
  void loadCountries().catch(() => {})
  void (canUseWebGL() ? loadGlobeView() : loadMapView()).catch(() => {})
}

/** Warm the map in the background once the app has settled, unless the user is saving data. */
export function preloadMapWhenIdle() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(preloadMap, { timeout: 4000 })
  else setTimeout(preloadMap, 2500)
}
