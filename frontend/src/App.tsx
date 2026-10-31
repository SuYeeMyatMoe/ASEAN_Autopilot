import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { loadMapPage } from './geo/preload'
import { SkeletonList } from './components/ui'
import ComparePage from './routes/ComparePage'
import Landing from './routes/Landing'
import MarketPage from './routes/MarketPage'
import MissionPage from './routes/MissionPage'
import Onboard from './routes/Onboard'
import PassportPage from './routes/PassportPage'
import PlanPage from './routes/PlanPage'

const MapPage = lazy(loadMapPage)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="onboard" replace />} />
          <Route path="onboard" element={<Onboard />} />
          <Route path="mission" element={<MissionPage />} />
          <Route path="passport" element={<PassportPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="gaps" element={<Navigate to="/app/plan?view=status" replace />} />
          <Route path="roadmap" element={<Navigate to="/app/plan" replace />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="desk" element={<MarketPage />} />
          <Route path="discover" element={<Navigate to="/app/desk?tab=opportunities" replace />} />
          <Route path="radar" element={<Navigate to="/app/desk?tab=regulation" replace />} />
          <Route
            path="map"
            element={
              <Suspense fallback={<SkeletonList rows={2} />}>
                <MapPage />
              </Suspense>
            }
          />
          <Route path="twin" element={<Navigate to="/app/map" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
