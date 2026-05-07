import { useState, useEffect, useCallback } from 'react'
import { Play, Square, Activity } from 'lucide-react'
import { api } from '@/api/client'
import { useAppState, useAppDispatch, useNotify } from '@/context/AppContext'
import PipelineTimeline from '@/components/PipelineTimeline'
import StageDetail from '@/components/StageDetail'
import HITLPanel from '@/components/HITLPanel'
import type { StageDef, StageStatus, ActiveRunState } from '@/types'

export default function PipelinePage() {
  const { currentRun } = useAppState()
  const dispatch = useAppDispatch()
  const notify = useNotify()

  const [stages, setStages] = useState<StageDef[]>([])
  const [stageMap, _setStageMap] = useState<Record<number, StageStatus>>({})
  const [selectedStage, setSelectedStage] = useState<StageDef | null>(null)
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [hitlWaiting, setHitlWaiting] = useState<any>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const status = await api.pipelineStatus()
      if (status.status !== 'idle') {
        dispatch({ type: 'SET_CURRENT_RUN', payload: status as unknown as ActiveRunState })
      }
    } catch {
      // ignore
    }
  }, [dispatch])

  useEffect(() => {
    api.pipelineStages().then((res) => {
      setStages(res.stages)
      if (res.stages.length > 0 && !selectedStage) {
        setSelectedStage(res.stages[0])
      }
    })
    refreshStatus()
    const id = setInterval(refreshStatus, 5000)
    return () => clearInterval(id)
  }, [refreshStatus, selectedStage])

  useEffect(() => {
    if (!currentRun?.run_id) return
    const poll = async () => {
      try {
        const hitl = await api.getHITL(currentRun.run_id)
        setHitlWaiting(hitl.waiting)
      } catch {
        setHitlWaiting(null)
      }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [currentRun?.run_id])

  const handleStart = async () => {
    if (!topic.trim()) return
    setLoading(true)
    try {
      const res = await api.startPipeline(topic)
      dispatch({ type: 'SET_CURRENT_RUN', payload: { run_id: res.run_id, status: 'running', output_dir: res.output_dir, topic } })
      notify('流水线已启动', 'success', res.run_id)
    } catch (err: any) {
      notify('启动流水线失败', 'error', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    try {
      await api.stopPipeline()
      notify('流水线已停止', 'warning')
    } catch (err: any) {
      notify('停止流水线失败', 'error', err.message)
    }
  }

  const currentStageNum = currentRun && 'current_stage' in currentRun ? (currentRun as any).current_stage || 0 : 0
  const totalStages = 23
  const progress = totalStages > 0 ? Math.round((currentStageNum / totalStages) * 100) : 0

  const selectedStatus = selectedStage ? (stageMap[selectedStage.number] || 'pending') : 'pending'

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
          <Activity className="h-5 w-5 text-indigo-400" />
          流水线监控
        </h1>
        <div className="flex items-center gap-3">
          {currentRun?.status === 'running' ? (
            <button onClick={handleStop} className="btn-danger" disabled={loading}>
              <Square className="h-4 w-4" /> 停止
            </button>
          ) : (
            <>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="研究主题..."
                className="w-64 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
              <button onClick={handleStart} className="btn-primary" disabled={loading || !topic.trim()}>
                <Play className="h-4 w-4" /> 启动
              </button>
            </>
          )}
        </div>
      </div>

      {currentRun && (
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-300">进度</span>
            <span className="font-mono text-slate-400">{currentStageNum} / {totalStages} ({progress}%)</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <HITLPanel runId={currentRun?.run_id || ''} waiting={hitlWaiting} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineTimeline
            stages={stages}
            stageMap={stageMap}
            currentStage={currentStageNum}
            onSelectStage={setSelectedStage}
          />
        </div>
        <div className="space-y-4">
          {selectedStage && (
            <StageDetail
              stage={selectedStage}
              status={selectedStatus}
            />
          )}
        </div>
      </div>
    </div>
  )
}
