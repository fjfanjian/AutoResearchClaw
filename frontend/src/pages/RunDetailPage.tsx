import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, FileText, ScrollText, BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import ArtifactViewer from '@/components/ArtifactViewer'
import LogViewer from '@/components/LogViewer'
import type { Run } from '@/types'

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const [run, setRun] = useState<Run | null>(null)
  const [tab, setTab] = useState<'artifacts' | 'logs' | 'metrics'>('artifacts')
  const [metrics, setMetrics] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (!runId) return
    api.getRun(runId).then((res) => {
      setRun(res as Run)
    }).catch(() => setRun(null))
    api.getRunMetrics(runId).then((res) => {
      setMetrics(res.metrics)
    }).catch(() => setMetrics({}))
  }, [runId])

  if (!runId) return <div className="text-slate-500">未选择运行</div>

  return (
    <div className="mx-auto h-[calc(100vh-7rem)] max-w-6xl space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/runs" className="btn-ghost px-2 py-1.5">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">{run?.run_id || runId}</h1>
          <p className="text-xs text-slate-500">{run?.topic || ''}</p>
        </div>
        <span className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          {run?.status || 'unknown'}
        </span>
      </div>

      <div className="flex gap-2 border-b border-slate-800 pb-1">
        <button
          onClick={() => setTab('artifacts')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'artifacts' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <FileText className="h-3.5 w-3.5" /> 产物
        </button>
        <button
          onClick={() => setTab('logs')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'logs' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <ScrollText className="h-3.5 w-3.5" /> 日志
        </button>
        <button
          onClick={() => setTab('metrics')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'metrics' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" /> 指标
        </button>
      </div>

      <div className="h-[calc(100%-6rem)]">
        {tab === 'artifacts' && <ArtifactViewer runId={runId} />}
        {tab === 'logs' && <LogViewer runId={runId} />}
        {tab === 'metrics' && (
          <div className="space-y-4">
            {Object.keys(metrics).length === 0 ? (
              <p className="text-sm text-slate-500">暂无指标</p>
            ) : (
              <pre className="overflow-auto rounded-md border border-slate-800 bg-slate-900 p-4 text-xs font-mono text-slate-300">
                {JSON.stringify(metrics, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
