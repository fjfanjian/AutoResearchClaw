import { useAppState } from '@/context/AppContext'

export default function TopBar() {
  const { currentRun } = useAppState()

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-6 backdrop-blur">
      <div className="flex items-center gap-4">
        {currentRun ? (
          <>
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                currentRun.status === 'running'
                  ? 'animate-pulse bg-indigo-400'
                  : currentRun.status === 'completed'
                  ? 'bg-emerald-400'
                  : currentRun.status === 'failed'
                  ? 'bg-rose-400'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-xs text-slate-400">{currentRun.run_id}</span>
            <span className="max-w-md truncate text-sm text-slate-200">
              {currentRun.topic || '无主题'}
            </span>
          </>
        ) : (
          <span className="text-sm text-slate-500">无活跃流水线</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {currentRun && (
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
            {currentRun.status}
          </span>
        )}
      </div>
    </header>
  )
}
