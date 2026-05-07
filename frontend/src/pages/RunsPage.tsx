import { RefreshCw } from 'lucide-react'
import { RunHistoryTable } from '../components/RunHistoryTable'
import { useRuns } from '../hooks/useRuns'

export function RunsPage() {
  const { runs, loading, refresh } = useRuns()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Run History</h1>
        <button
          onClick={() => { void refresh() }}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-100 transition-colors"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
        <RunHistoryTable runs={runs} loading={loading} />
      </div>
    </div>
  )
}
