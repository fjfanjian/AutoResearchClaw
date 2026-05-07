import { useEffect, useState } from 'react'
import { Shield, Loader2 } from 'lucide-react'
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

export default function PipelineTimeline({ stages, stageMap, currentStage, onSelectStage }: Props) {
  const [defs, setDefs] = useState<StageDef[]>(stages)

  useEffect(() => {
    if (stages.length) return
    api.pipelineStages().then((res) => setDefs(res.stages)).catch(() => setDefs([]))
  }, [stages.length])

  const grouped = defs.reduce<Record<string, StageDef[]>>((acc, s) => {
    const phase = s.phase?.charAt(0) || 'A'
    if (!acc[phase]) acc[phase] = []
    acc[phase].push(s)
    return acc
  }, {})

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
    <div className="space-y-6">
      {Object.entries(grouped).map(([phase, items]) => (
        <div key={phase} className={`rounded-lg border border-slate-800 ${PHASE_COLORS[phase] || 'border-l-slate-600'} bg-slate-900/50`}>
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            阶段 {phase} · {PHASE_LABELS[phase] || ''}
          </div>
          <div className="divide-y divide-slate-800/50">
            {items.map((s) => {
              const status = getStatus(s.number)
              const isGate = GATE_STAGES.has(s.number)
              const isActive = currentStage === s.number
              return (
                <button
                  key={s.number}
                  onClick={() => onSelectStage(s)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/60 ${
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
        </div>
      ))}
    </div>
  )
}
