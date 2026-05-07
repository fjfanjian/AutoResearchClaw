import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Run } from '../types'

interface Props {
  runs: Run[]
  loading: boolean
}

const STATUS_BADGE: Record<string, string> = {
  running: 'bg-success/20 text-success',
  completed: 'bg-accent/20 text-accent',
  failed: 'bg-danger/20 text-danger',
  stopped: 'bg-warning/20 text-warning',
  unknown: 'bg-surface-border text-muted',
  no_checkpoint: 'bg-surface-border text-muted',
}

function parseDate(runId: string): string {
  // rc-20240501-123456-abc123 → 2024-05-01 12:34:56
  const m = runId.match(/^rc-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/)
  if (!m) return ''
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`
}

export function RunHistoryTable({ runs, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted text-sm animate-pulse">
        Loading runs…
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted text-sm">
        No runs found
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border text-xs text-muted">
            <th className="text-left px-4 py-2 font-medium">Run ID</th>
            <th className="text-left px-4 py-2 font-medium">Started</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Stage</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const status =
              run.checkpoint?.status ?? run.status ?? 'unknown'
            const stage = run.checkpoint?.stage ?? run.stages_completed?.length
            return (
              <tr
                key={run.run_id}
                className="border-b border-surface-border hover:bg-surface-overlay transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-accent">
                  {run.run_id}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {parseDate(run.run_id)}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      STATUS_BADGE[String(status)] ?? STATUS_BADGE.unknown
                    }`}
                  >
                    {String(status)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {stage != null ? `Stage ${String(stage)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    to={`/runs/${run.run_id}`}
                    className="text-accent hover:underline inline-flex items-center gap-1 text-xs"
                  >
                    Details <ExternalLink size={11} />
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
