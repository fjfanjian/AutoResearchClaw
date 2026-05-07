import { useApp } from '../context/AppContext'
import { DeliverablesView } from '../components/DeliverablesView'

export function PaperPage() {
  const { state } = useApp()
  const { activeRunId } = state

  if (!activeRunId) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No active run. Start a pipeline to see the paper output here.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-surface-border bg-surface-raised shrink-0">
        <h1 className="text-sm font-semibold">Paper Preview</h1>
        <p className="text-xs text-muted font-mono mt-0.5">{activeRunId}</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <DeliverablesView runId={activeRunId} />
      </div>
    </div>
  )
}
