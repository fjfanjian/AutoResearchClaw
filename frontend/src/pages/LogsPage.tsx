import { useApp } from '../context/AppContext'
import { LogViewer } from '../components/LogViewer'

export function LogsPage() {
  const { state } = useApp()
  const { activeRunId } = state

  if (!activeRunId) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No active run — start a pipeline or select a run from the Runs page.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-3 border-b border-surface-border bg-surface-raised shrink-0">
        <h1 className="text-sm font-semibold">Pipeline Logs</h1>
        <p className="text-xs text-muted font-mono mt-0.5">{activeRunId}</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <LogViewer runId={activeRunId} tail={500} polling pollMs={3000} />
      </div>
    </div>
  )
}
