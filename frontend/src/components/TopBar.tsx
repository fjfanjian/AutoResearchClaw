import { useAppState } from '@/context/AppContext'
import { Clock, AlertTriangle } from 'lucide-react'

export default function TopBar() {
  const { currentRun } = useAppState()

  const stageNum = currentRun?.current_stage || 0
  const totalStages = currentRun?.total_stages || 23
  const progress = totalStages > 0 ? Math.round((stageNum / totalStages) * 100) : 0
  const isRunning = currentRun?.status === 'running'
  const isCompleted = currentRun?.status === 'completed'
  const isFailed = currentRun?.status === 'failed'
  const isStopped = currentRun?.status === 'stopped'

  const statusDot = () => {
    if (isRunning) {
      return (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
        </span>
      )
    }
    if (isCompleted) return <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
    if (isFailed) return <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
    if (isStopped) return <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
    return <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
  }

  const statusLabel = () => {
    if (isRunning) return '运行中'
    if (isCompleted) return '已完成'
    if (isFailed) return '失败'
    if (isStopped) return '已停止'
    return '空闲'
  }

  const statusColor = () => {
    if (isRunning) return 'text-indigo-300 bg-indigo-500/20'
    if (isCompleted) return 'text-emerald-300 bg-emerald-500/20'
    if (isFailed) return 'text-rose-300 bg-rose-500/20'
    if (isStopped) return 'text-amber-300 bg-amber-500/20'
    return 'text-slate-400 bg-slate-800'
  }

  return (
    <header className="flex h-14 items-center border-b border-slate-800 bg-slate-900/80 px-6 backdrop-blur">
      <div className="flex flex-1 items-center gap-4 min-w-0">
        {currentRun ? (
          <>
            {statusDot()}
            <span className="text-xs font-mono text-slate-500 hidden sm:inline">{currentRun.run_id}</span>
            <span className="max-w-xs truncate text-sm text-slate-200 font-medium">
              {currentRun.topic || '无主题'}
            </span>
            {/* Progress bar (compact) */}
            <div className="hidden md:flex items-center gap-2 flex-1 max-w-xs">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    isFailed ? 'bg-rose-500' : isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 tabular-nums w-16 text-right">
                {stageNum}/{totalStages}
              </span>
            </div>
            {/* Current stage name */}
            {currentRun.current_stage_name && (
              <span className="hidden lg:inline text-xs text-indigo-400 truncate">
                {currentRun.current_stage_name}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-slate-500">无活跃流水线</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {currentRun && (
          <>
            {/* Elapsed time */}
            {currentRun.elapsed_sec != null && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" />
                {formatDuration(currentRun.elapsed_sec)}
              </span>
            )}
            {/* Error indicator */}
            {currentRun.error && (
              <span title={currentRun.error}><AlertTriangle className="h-4 w-4 text-rose-400" /></span>
            )}
            {/* Status badge */}
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColor()}`}>
              {statusLabel()}
            </span>
          </>
        )}
      </div>
    </header>
  )
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}
