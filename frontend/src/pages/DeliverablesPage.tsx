import { useApp } from '../context/AppContext'
import { DeliverablesView } from '../components/DeliverablesView'

export function DeliverablesPage() {
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
      <div className="px-6 py-4 border-b border-surface-border bg-surface-raised shrink-0">
        <h1 className="text-sm font-semibold">Deliverables</h1>
        <p className="text-xs text-muted mt-0.5 font-mono">{activeRunId}</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <DeliverablesView runId={activeRunId} />
      </div>
    </div>
  )
}
