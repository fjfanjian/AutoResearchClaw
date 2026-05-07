import { Routes, Route } from 'react-router-dom'
import { AppProvider } from '@/context/AppContext'
import { useEventStream } from '@/hooks/useEventStream'
import Layout from '@/components/Layout'
import PipelinePage from '@/pages/PipelinePage'
import RunsPage from '@/pages/RunsPage'
import RunDetailPage from '@/pages/RunDetailPage'
import DeliverablesPage from '@/pages/DeliverablesPage'
import SettingsPage from '@/pages/SettingsPage'

function EventStreamConnector() {
  useEventStream()
  return null
}

export default function App() {
  return (
    <AppProvider>
      <EventStreamConnector />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<PipelinePage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="runs/:runId" element={<RunDetailPage />} />
          <Route path="deliverables" element={<DeliverablesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}
