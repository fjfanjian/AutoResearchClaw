import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import type { StageState } from '../types'
import { GATE_STAGES } from '../types'
import { fetchArtifacts } from '../api/client'
import type { ArtifactNode } from '../types'

interface Props {
  stage: StageState
  runId: string | null
  onOpenArtifact?: (path: string) => void
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  pending: { cls: 'bg-surface-border text-muted', label: 'Pending' },
  running: { cls: 'bg-success/20 text-success', label: 'Running' },
  done: { cls: 'bg-accent/20 text-accent', label: 'Done' },
  failed: { cls: 'bg-danger/20 text-danger', label: 'Failed' },
  blocked_approval: { cls: 'bg-warning/20 text-warning', label: 'Awaiting Approval' },
  approved: { cls: 'bg-success/20 text-success', label: 'Approved' },
  rejected: { cls: 'bg-danger/20 text-danger', label: 'Rejected' },
  paused: { cls: 'bg-warning/20 text-warning', label: 'Paused' },
  retrying: { cls: 'bg-warning/20 text-warning', label: 'Retrying' },
}

function flatFiles(node: ArtifactNode, prefix = ''): string[] {
  const rel = prefix ? `${prefix}/${node.name}` : node.name
  if (node.type === 'file') return [rel]
  return (node.children ?? []).flatMap((c) => flatFiles(c, rel))
}

export function StageDetail({ stage, runId, onOpenArtifact }: Props) {
  const [stageFiles, setStageFiles] = useState<string[]>([])
  const badge = STATUS_BADGE[stage.status] ?? STATUS_BADGE.pending
  const isGate = GATE_STAGES.has(stage.number)

  useEffect(() => {
    if (!runId) return
    fetchArtifacts(runId)
      .then(({ tree }) => {
        const stageDir = `stage-${stage.number.toString().padStart(2, '0')}`
        const stageNode = tree.children?.find(
          (c) => c.name === stageDir && c.type === 'directory',
        )
        if (stageNode) {
          setStageFiles(flatFiles(stageNode))
        }
      })
      .catch(() => {})
  }, [runId, stage.number])

  return (
    <div className="p-4 border border-surface-border rounded-xl bg-surface-overlay space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted">
              Stage {stage.number.toString().padStart(2, '0')}
            </span>
            {isGate && (
              <span className="text-xs px-1.5 py-0.5 bg-warning/20 text-warning rounded font-mono">
                GATE
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold mt-0.5">{stage.label || stage.name}</h3>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Timing */}
      {(stage.started_at || stage.duration_sec != null) && (
        <div className="flex gap-4 text-xs text-muted">
          {stage.started_at && (
            <span>Started: {new Date(stage.started_at).toLocaleTimeString()}</span>
          )}
          {stage.duration_sec != null && (
            <span>Duration: {stage.duration_sec.toFixed(2)}s</span>
          )}
        </div>
      )}

      {/* Error */}
      {stage.error && (
        <div className="bg-danger/10 border border-danger/30 rounded p-2 text-xs text-danger font-mono whitespace-pre-wrap">
          {stage.error}
        </div>
      )}

      {/* PRM score */}
      {stage.prm_score != null && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">PRM Score:</span>
          <span className="text-accent font-mono">{stage.prm_score.toFixed(3)}</span>
        </div>
      )}

      {/* Artifact list */}
      {stageFiles.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-1.5">Artifacts ({stageFiles.length})</p>
          <ul className="space-y-1">
            {stageFiles.slice(0, 10).map((f) => (
              <li key={f}>
                <button
                  onClick={() => onOpenArtifact?.(f)}
                  className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                >
                  <FileText size={12} className="shrink-0" />
                  <span className="truncate">{f}</span>
                </button>
              </li>
            ))}
            {stageFiles.length > 10 && (
              <li className="text-xs text-muted">+{stageFiles.length - 10} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
