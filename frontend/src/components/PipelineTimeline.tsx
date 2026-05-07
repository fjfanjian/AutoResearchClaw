import { Shield } from 'lucide-react'
import type { StageState } from '../types'
import { GATE_STAGES, PHASE_INFO, STAGE_PHASE } from '../types'

interface Props {
  stages: StageState[]
  activeStage: number | null
  onSelect: (stage: number) => void
}

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  running: '◉',
  done: '✓',
  failed: '✗',
  blocked_approval: '⏸',
  approved: '✓',
  rejected: '✗',
  paused: '⏸',
  retrying: '↺',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-muted border-surface-border',
  running: 'text-success border-success bg-success/10',
  done: 'text-accent border-accent/40 bg-accent/5',
  failed: 'text-danger border-danger/60 bg-danger/10',
  blocked_approval: 'text-warning border-warning bg-warning/10',
  approved: 'text-success border-success/40',
  rejected: 'text-danger border-danger/40',
  paused: 'text-warning border-warning',
  retrying: 'text-warning border-warning',
}

export function PipelineTimeline({ stages, activeStage, onSelect }: Props) {
  // Group stages by phase
  const phaseGroups: Record<string, StageState[]> = {}
  for (const s of stages) {
    const ph = STAGE_PHASE[s.number] ?? 'X'
    if (!phaseGroups[ph]) phaseGroups[ph] = []
    phaseGroups[ph].push(s)
  }

  const totalDone = stages.filter((s) => s.status === 'done').length
  const progress = stages.length > 0 ? (totalDone / stages.length) * 100 : 0

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted whitespace-nowrap">
          {totalDone} / {stages.length} stages
        </span>
      </div>

      {/* Phase groups */}
      {Object.entries(phaseGroups).map(([phase, phaseStages]) => {
        const info = PHASE_INFO[phase]
        return (
          <div key={phase} className="flex flex-col gap-1">
            {/* Phase header */}
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{ color: info?.color ?? '#fff', background: `${info?.color ?? '#fff'}20` }}
              >
                Phase {phase}
              </span>
              <span className="text-xs text-muted">{info?.label}</span>
            </div>

            {/* Stage nodes */}
            <div className="flex flex-col gap-1 pl-4 border-l-2"
              style={{ borderColor: `${info?.color ?? '#888'}40` }}>
              {phaseStages.map((s) => {
                const isGate = GATE_STAGES.has(s.number)
                const isActive = activeStage === s.number
                const colorCls = STATUS_COLOR[s.status] ?? STATUS_COLOR.pending
                const isRunning = s.status === 'running'

                return (
                  <button
                    key={s.number}
                    onClick={() => onSelect(s.number)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer w-full ${colorCls} ${
                      isActive ? 'ring-1 ring-accent/50' : ''
                    } hover:bg-surface-overlay`}
                  >
                    {/* Gate icon */}
                    {isGate ? (
                      <Shield
                        size={14}
                        className="shrink-0"
                        style={{ color: '#d29922' }}
                      />
                    ) : (
                      <span
                        className={`text-sm shrink-0 w-4 ${isRunning ? 'animate-pulse_slow' : ''}`}
                      >
                        {STATUS_ICON[s.status] ?? '○'}
                      </span>
                    )}
                    {/* Stage info */}
                    <span className="text-xs font-mono text-muted shrink-0 w-6">
                      {s.number.toString().padStart(2, '0')}
                    </span>
                    <span className="text-sm truncate flex-1">{s.label || s.name}</span>
                    {s.duration_sec != null && (
                      <span className="text-xs text-muted shrink-0">
                        {s.duration_sec.toFixed(1)}s
                      </span>
                    )}
                    {isGate && (
                      <span className="text-xs text-warning shrink-0 font-mono">GATE</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
