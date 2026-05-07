import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArtifactViewer } from '../components/ArtifactViewer'
import { LogViewer } from '../components/LogViewer'
import { MetricCharts } from '../components/MetricCharts'
import { QualityGate } from '../components/QualityGate'
import { fetchRun, fetchRunMetrics } from '../api/client'
import type { Run } from '../types'

type Tab = 'artifacts' | 'logs' | 'metrics'

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const [run, setRun] = useState<Run | null>(null)
  const [metrics, setMetrics] = useState<Record<string, unknown>>({})
  const [tab, setTab] = useState<Tab>('artifacts')

  useEffect(() => {
    if (!runId) return
    fetchRun(runId)
      .then(setRun)
      .catch(() => {})
    fetchRunMetrics(runId)
      .then(({ metrics: m }) => setMetrics(m))
      .catch(() => {})
  }, [runId])

  if (!runId) return <div className="p-6 text-danger">Invalid run ID</div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-border bg-surface-raised shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold font-mono">{runId}</h1>
            {run?.checkpoint?.stage != null && (
              <p className="text-xs text-muted mt-0.5">
                Last stage: {String(run.checkpoint.stage)}
              </p>
            )}
          </div>
          {run?.checkpoint?.status && (
            <span className="text-xs px-2 py-0.5 bg-surface-overlay border border-surface-border rounded-full text-muted">
              {String(run.checkpoint.status)}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {(['artifacts', 'logs', 'metrics'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                tab === t
                  ? 'bg-accent/20 text-accent'
                  : 'text-muted hover:text-gray-100'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'artifacts' && <ArtifactViewer runId={runId} />}

        {tab === 'logs' && (
          <div className="h-full">
            <LogViewer runId={runId} tail={500} polling pollMs={5000} />
          </div>
        )}

        {tab === 'metrics' && (
          <div className="p-6 grid gap-4 grid-cols-1 lg:grid-cols-2">
            <div className="bg-surface-raised border border-surface-border rounded-xl p-4">
              <h2 className="text-sm font-medium mb-3">Experiment Metrics</h2>
              <MetricCharts data={metrics} />
            </div>
            <QualityGate
              scores={metrics.quality_scores as Record<string, number> | undefined}
              overall={metrics.overall_quality as number | undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
