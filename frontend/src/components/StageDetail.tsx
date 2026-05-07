import { Clock, FileText, Gauge } from 'lucide-react'
import type { StageDef, StageStatus } from '@/types'

interface Props {
  stage: StageDef
  status: StageStatus
  durationSec?: number
  artifactCount?: number
  prmScore?: number
  error?: string
}

export default function StageDetail({ stage, status, durationSec, artifactCount, prmScore, error }: Props) {
  const statusLabel: Record<string, string> = {
    pending: '等待中',
    running: '运行中',
    done: '已完成',
    failed: '失败',
    blocked: '阻塞',
    paused: '暂停',
    approved: '已批准',
    rejected: '已拒绝',
  }

  const statusColor: Record<string, string> = {
    pending: 'text-slate-400 bg-slate-800',
    running: 'text-indigo-300 bg-indigo-500/20',
    done: 'text-emerald-300 bg-emerald-500/20',
    failed: 'text-rose-300 bg-rose-500/20',
    blocked: 'text-amber-300 bg-amber-500/20',
    paused: 'text-amber-300 bg-amber-500/20',
    approved: 'text-emerald-300 bg-emerald-500/20',
    rejected: 'text-rose-300 bg-rose-500/20',
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            {stage.number}. {stage.label}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{stage.phase}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor[status] || statusColor.pending}`}>
          {statusLabel[status] || status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {durationSec !== undefined && (
          <div className="rounded-md bg-slate-800/60 p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              耗时
            </div>
            <p className="mt-1 text-sm font-mono text-slate-200">{durationSec.toFixed(1)}s</p>
          </div>
        )}
        {artifactCount !== undefined && (
          <div className="rounded-md bg-slate-800/60 p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <FileText className="h-3.5 w-3.5" />
              产物
            </div>
            <p className="mt-1 text-sm font-mono text-slate-200">{artifactCount}</p>
          </div>
        )}
        {prmScore !== undefined && (
          <div className="rounded-md bg-slate-800/60 p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Gauge className="h-3.5 w-3.5" />
              PRM 评分
            </div>
            <p className="mt-1 text-sm font-mono text-slate-200">{prmScore.toFixed(2)}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
    </div>
  )
}
