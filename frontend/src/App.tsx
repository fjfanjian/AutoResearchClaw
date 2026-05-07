import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { Layout } from './components/Layout'
import { PipelinePage } from './pages/PipelinePage'
import { RunsPage } from './pages/RunsPage'
import { RunDetailPage } from './pages/RunDetailPage'
import { DeliverablesPage } from './pages/DeliverablesPage'
import { SettingsPage } from './pages/SettingsPage'
import { LogsPage } from './pages/LogsPage'
import { PaperPage } from './pages/PaperPage'

export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<PipelinePage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/runs/:runId" element={<RunDetailPage />} />
            <Route path="/deliverables" element={<DeliverablesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/paper" element={<PaperPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </HashRouter>
    </AppProvider>
  )
}
