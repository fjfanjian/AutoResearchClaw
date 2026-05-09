import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, ArrowRight, Loader2, AlertCircle, CheckCircle2, Clock, RotateCw } from 'lucide-react'
import { useRuns } from '@/hooks/useRuns'
import { api } from '@/api/client'
import { useNotify } from '@/context/AppContext'

const statusIcon: Record<string, React.ReactNode> = {
  running: <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  failed: <AlertCircle className="h-4 w-4 text-rose-400" />,
  stopped: <Clock className="h-4 w-4 text-amber-400" />,
  interrupted: <AlertCircle className="h-4 w-4 text-amber-400" />,
}

function canResume(run: { status?: string; current_stage?: number }): boolean {
  if (run.status === 'running') return false
  if (run.current_stage == null) return false
  return run.current_stage > 0 && run.current_stage < 23
}

export default function RunsPage() {
  const { runs, loading, error } = useRuns()
  const [filter, setFilter] = useState('')
  const [resumingId, setResumingId] = useState<string | null>(null)
  const navigate = useNavigate()
  const notify = useNotify()

  const filtered = runs.filter((r) =>
    r.run_id.toLowerCase().includes(filter.toLowerCase()) ||
    (r.topic || '').toLowerCase().includes(filter.toLowerCase())
  )

  const handleResume = async (runId: string) => {
    setResumingId(runId)
    try {
      await api.resumePipeline(runId)
      notify('流水线已恢复', 'success', runId)
      navigate('/')
    } catch (err: any) {
      notify('恢复流水线失败', 'error', err.message)
    } finally {
      setResumingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">运行历史</h1>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索运行..."
            className="w-full rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {loading && filtered.length === 0 && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载运行历史...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((run) => (
          <div
            key={run.run_id}
            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-5 py-4 transition-colors hover:border-slate-700 hover:bg-slate-800/40"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {statusIcon[run.status || ''] || <Clock className="h-4 w-4 text-slate-500" />}
                <span className="text-sm font-mono text-slate-300">{run.run_id}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  {run.status || 'unknown'}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">{run.topic || '无主题'}</p>
              {run.current_stage !== undefined && (
                <p className="text-xs text-slate-600">
                  阶段 {run.current_stage}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canResume(run) && (
                <button
                  onClick={() => handleResume(run.run_id)}
                  disabled={resumingId === run.run_id}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  {resumingId === run.run_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5" />
                  )}
                  {resumingId === run.run_id ? '恢复中...' : '恢复'}
                </button>
              )}
              <Link
                to={`/runs/${run.run_id}`}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/10"
              >
                查看 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
