import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { SkeletonList } from './components/ui'
import ComparePage from './routes/ComparePage'
import DeskPage from './routes/DeskPage'
import DiscoverPage from './routes/DiscoverPage'
import GapsPage from './routes/GapsPage'
import Landing from './routes/Landing'
import MissionPage from './routes/MissionPage'
import Onboard from './routes/Onboard'
import PassportPage from './routes/PassportPage'
import RadarPage from './routes/RadarPage'
import RoadmapPage from './routes/RoadmapPage'

const TwinPage = lazy(() => import('./routes/TwinPage'))

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
          <Route path="gaps" element={<GapsPage />} />
          <Route path="roadmap" element={<RoadmapPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="desk" element={<DeskPage />} />
          <Route path="radar" element={<RadarPage />} />
          <Route
            path="twin"
            element={
              <Suspense fallback={<SkeletonList rows={2} />}>
                <TwinPage />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
