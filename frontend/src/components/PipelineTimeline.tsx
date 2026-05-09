import { useState, useEffect, useMemo } from 'react'
import { Shield, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '@/api/client'
import type { StageDef, StageStatus } from '@/types'

const PHASE_COLORS: Record<string, string> = {
  'A': 'border-l-rose-400',
  'B': 'border-l-amber-400',
  'C': 'border-l-yellow-400',
  'D': 'border-l-emerald-400',
  'E': 'border-l-teal-400',
  'F': 'border-l-cyan-400',
  'G': 'border-l-blue-400',
  'H': 'border-l-indigo-400',
}

const PHASE_LABELS: Record<string, string> = {
  'A': '研究界定',
  'B': '文献发现',
  'C': '知识综合',
  'D': '实验设计',
  'E': '实验执行',
  'F': '分析与决策',
  'G': '论文撰写',
  'H': '最终定稿',
}

const GATE_STAGES = new Set([5, 9, 20])

interface Props {
  stages: StageDef[]
  stageMap: Record<number, StageStatus>
  currentStage: number
  onSelectStage: (stage: StageDef) => void
}

interface PhaseStats {
  total: number
  done: number
  failed: number
  running: boolean
  started: boolean
}

function calcPhaseStats(items: StageDef[], stageMap: Record<number, StageStatus>): PhaseStats {
  let total = items.length
  let done = 0
  let failed = 0
  let running = false
  let started = false
  for (const s of items) {
    const st = stageMap[s.number]
    if (st === 'done' || st === 'approved') done++
    else if (st === 'failed' || st === 'rejected') failed++
    else if (st === 'running') running = true
    if (st && st !== 'pending') started = true
  }
  return { total, done, failed, running, started }
}

export default function PipelineTimeline({ stages, stageMap, currentStage, onSelectStage }: Props) {
  const [defs, setDefs] = useState<StageDef[]>(stages)

  useEffect(() => {
    if (stages.length) return
    api.pipelineStages().then((res) => setDefs(res.stages)).catch(() => setDefs([]))
  }, [stages.length])

  // Group stages by phase letter (from StageDef.phase)
  const grouped = useMemo(() => {
    return defs.reduce<Record<string, StageDef[]>>((acc, s) => {
      const phase = s.phase?.charAt(0) || 'A'
      if (!acc[phase]) acc[phase] = []
      acc[phase].push(s)
      return acc
    }, {})
  }, [defs])

  // Phase stats map
  const phaseStatsMap = useMemo(() => {
    const m: Record<string, PhaseStats> = {}
    for (const [phase, items] of Object.entries(grouped)) {
      m[phase] = calcPhaseStats(items, stageMap)
    }
    return m
  }, [grouped, stageMap])

  // Find which phase the current stage belongs to
  const currentPhase = useMemo(() => {
    for (const [phase, items] of Object.entries(grouped)) {
      if (items.some((s) => s.number === currentStage)) return phase
    }
    return null
  }, [grouped, currentStage])

  // Collapse state: auto-expand the phase containing currentStage
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Sync expanded when currentPhase changes
  useEffect(() => {
    if (currentPhase) {
      setExpanded((prev) => new Set(prev).add(currentPhase))
    }
  }, [currentPhase])

  const togglePhase = (phase: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }

  const getStatus = (num: number): StageStatus => stageMap[num] || 'pending'

  const statusDot = (status: StageStatus) => {
    switch (status) {
      case 'running':
        return (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500" />
          </span>
        )
      case 'done':
      case 'approved':
        return <span className="h-3 w-3 rounded-full bg-emerald-400" />
      case 'failed':
      case 'rejected':
        return <span className="h-3 w-3 rounded-full bg-rose-400" />
      case 'paused':
      case 'blocked':
        return <span className="h-3 w-3 rounded-full bg-amber-400" />
      default:
        return <span className="h-3 w-3 rounded-full border border-slate-600 bg-slate-800" />
    }
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([phase, items]) => {
        const stats = phaseStatsMap[phase]!
        const isExpanded = expanded.has(phase)
        const isCurrentPhase = phase === currentPhase

        // Determine card accent style based on phase status
        const cardAccent = stats.running || isCurrentPhase
          ? 'border-indigo-700/50 bg-indigo-950/10'
          : stats.failed > 0
            ? 'border-rose-700/50 bg-rose-950/10'
            : stats.done === stats.total && stats.total > 0
              ? 'border-emerald-700/50 bg-emerald-950/10'
              : 'border-slate-800 bg-slate-900/50'

        return (
          <div
            key={phase}
            className={`rounded-lg border ${PHASE_COLORS[phase] || 'border-l-slate-600'} ${cardAccent} transition-colors`}
          >
            {/* ── Phase header (clickable) ── */}
            <button
              onClick={() => togglePhase(phase)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-slate-800/40"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                )}
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  阶段 {phase} · {PHASE_LABELS[phase] || ''}
                </span>
              </div>

              {/* Phase stats badge */}
              <div className="flex items-center gap-2">
                {stats.running && (
                  <span className="flex items-center gap-1 text-xs text-indigo-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    运行中
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                  stats.done === stats.total && stats.total > 0
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : stats.failed > 0
                      ? 'bg-rose-500/20 text-rose-300'
                      : stats.started
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'bg-slate-800 text-slate-500'
                }`}>
                  {stats.done}/{stats.total}
                </span>
              </div>
            </button>

            {/* ── Phase body (collapsible) ── */}
            {isExpanded && (
              <div className="divide-y divide-slate-800/50 border-t border-slate-800/50">
                {items.map((s) => {
                  const status = getStatus(s.number)
                  const isGate = GATE_STAGES.has(s.number)
                  const isActive = currentStage === s.number
                  return (
                    <button
                      key={s.number}
                      onClick={() => onSelectStage(s)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-800/60 ${
                        isActive ? 'bg-slate-800/80' : ''
                      }`}
                    >
                      {statusDot(status)}
                      <span className="w-6 text-xs font-mono text-slate-500 tabular-nums">{s.number}</span>
                      <span className="flex-1 text-sm text-slate-200">{s.label}</span>
                      {isGate && (
                        <Shield className="h-4 w-4 text-amber-400" />
                      )}
                      {status === 'running' && (
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
