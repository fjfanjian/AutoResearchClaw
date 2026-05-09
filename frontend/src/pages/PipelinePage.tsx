import { useState, useEffect, useCallback, useMemo } from 'react'
import { Play, Square, Activity, Terminal, ChevronDown, ChevronUp, Wifi, WifiOff, Stethoscope, CheckCircle, XCircle, AlertTriangle, RotateCw, Clock } from 'lucide-react'
import { api } from '@/api/client'
import { useAppState, useAppDispatch, useNotify } from '@/context/AppContext'
import PipelineTimeline from '@/components/PipelineTimeline'
import StageDetail from '@/components/StageDetail'
import HITLPanel from '@/components/HITLPanel'
import NewTaskModal from '@/components/NewTaskModal'
import type { StageDef, StageStatus, ActiveRunState, DoctorReport, DoctorCheck } from '@/types'

export default function PipelinePage() {
  const { currentRun, liveLogs, eventConnected, stageEvents } = useAppState()
  const dispatch = useAppDispatch()
  const notify = useNotify()

  const [stages, setStages] = useState<StageDef[]>([])
  const [selectedStage, setSelectedStage] = useState<StageDef | null>(null)
  const [loading, setLoading] = useState(false)
  const [hitlWaiting, setHitlWaiting] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [showLiveLog, setShowLiveLog] = useState(false)
  const [logAutoScroll, setLogAutoScroll] = useState(true)
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null)
  const [doctorLoading, setDoctorLoading] = useState(false)
  const [showDoctor, setShowDoctor] = useState(false)

  // ── Build stageMap from stageEvents ──────────────────────────
  const stageMap = useMemo(() => {
    const map: Record<number, StageStatus> = {}
    for (const ev of stageEvents) {
      map[ev.stage] = ev.status as StageStatus
    }
    return map
  }, [stageEvents])

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

  const handleStart = async (topic: string, autoApprove: boolean, configOverrides?: Record<string, unknown>) => {
    setLoading(true)
    try {
      const res = await api.startPipeline(topic, autoApprove, configOverrides)
      dispatch({
        type: 'SET_CURRENT_RUN',
        payload: {
          run_id: res.run_id,
          status: 'running',
          output_dir: res.output_dir,
          topic,
          current_stage: 1,
          current_stage_name: '',
          total_stages: 23,
        },
      })
      dispatch({ type: 'CLEAR_LIVE_LOGS' })
      notify('流水线已启动', 'success', res.run_id)
      setShowModal(false)
      setShowLiveLog(true)
    } catch (err: any) {
      notify('启动流水线失败', 'error', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDoctor = async () => {
    setDoctorLoading(true)
    setShowDoctor(true)
    try {
      const report = await api.doctor()
      setDoctorReport(report)
    } catch (err: any) {
      notify('环境诊断失败', 'error', err.message)
    } finally {
      setDoctorLoading(false)
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

  const stageNum = currentRun?.current_stage || 0
  const stageName = currentRun?.current_stage_name || ''
  const totalStages = currentRun?.total_stages || 23
  const progress = totalStages > 0 ? Math.round((stageNum / totalStages) * 100) : 0

  const selectedStatus = selectedStage ? (stageMap[selectedStage.number] || 'pending') : 'pending'

  // Live logs filtering for current run
  const currentRunLogs = currentRun?.run_id
    ? liveLogs.filter((l) => l.runId === currentRun.run_id || l.runId === 'current')
    : liveLogs

  const highlightLine = (line: string) => {
    if (line.includes('ERROR') || line.includes('CRITICAL')) return 'text-rose-300'
    if (line.includes('WARNING') || line.includes('BUDGET EXCEEDED')) return 'text-amber-300'
    if (line.includes('SUCCESS') || line.includes('Done') || line.includes('completed')) return 'text-emerald-300'
    if (line.includes('INFO')) return 'text-blue-300'
    return 'text-slate-400'
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
          <Activity className="h-5 w-5 text-indigo-400" />
          流水线监控
        </h1>
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <span className="flex items-center gap-1.5 text-xs text-slate-500" title="实时事件连接">
            {eventConnected ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-rose-400" />
            )}
            {eventConnected ? '实时' : '离线'}
          </span>
          {currentRun?.status === 'running' || currentRun?.status === 'starting' ? (
            <button onClick={handleStop} className="btn-danger" disabled={loading}>
              <Square className="h-4 w-4" /> 停止
            </button>
          ) : (
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <Play className="h-4 w-4" /> 新建研究
            </button>
          )}
        </div>
      </div>

      {/* ── Current Run Status Banner ───────────────────────── */}
      {currentRun && (
        <div className={`relative overflow-hidden rounded-xl border ${
          isRunning(currentRun) ? 'border-indigo-700/50 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900' :
          isCompleted(currentRun) ? 'border-emerald-700/50 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900' :
          isFailed(currentRun) ? 'border-rose-700/50 bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900' :
          'border-slate-800 bg-slate-900/50'
        }`}>
          {/* Top row: topic + status badge */}
          <div className="flex items-start justify-between p-5 pb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-100 truncate">
                  {currentRun.topic || '未命名任务'}
                </h2>
                <StatusBadge status={currentRun.status} />
              </div>
              <p className="mt-0.5 text-xs font-mono text-slate-600">{currentRun.run_id}</p>
            </div>
            <div className="flex items-center gap-4 text-right shrink-0 ml-4">
              {/* Elapsed time */}
              {currentRun.elapsed_sec != null && (
                <div className="hidden sm:block">
                  <p className="text-xs text-slate-500">已耗时</p>
                  <p className="text-sm font-mono text-slate-300">
                    <Clock className="inline h-3.5 w-3.5 mr-1 text-slate-500" />
                    {formatDuration(currentRun.elapsed_sec)}
                  </p>
                </div>
              )}
              {/* Stage count */}
              <div>
                <p className="text-xs text-slate-500">阶段进度</p>
                <p className="text-sm font-mono text-slate-300">{stageNum} / {totalStages}</p>
              </div>
            </div>
          </div>

          {/* Stage name (large) */}
          {stageName && (
            <div className="px-5 pb-2">
              <span className="text-sm font-medium text-indigo-300">
                当前: {stageName}
              </span>
            </div>
          )}

          {/* Progress bar (large) */}
          <div className="px-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${
                    isFailed(currentRun)
                      ? 'bg-gradient-to-r from-rose-600 to-rose-400'
                      : isCompleted(currentRun)
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                        : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400'
                  }`}
                  style={{ width: `${Math.max(progress, isRunning(currentRun) ? 2 : 0)}%` }}
                />
              </div>
              <span className="text-sm font-mono text-slate-400 tabular-nums w-12 text-right">
                {progress}%
              </span>
            </div>
            {/* Progress steps */}
            <div className="mt-1.5 flex text-[10px] text-slate-600">
              <span>阶段 1</span>
              <span className="ml-auto">{stageNum > 0 ? `阶段 ${stageNum}` : '等待开始'}</span>
              <span className="ml-auto">阶段 {totalStages}</span>
            </div>
          </div>

          {/* Error display */}
          {currentRun.error && (
            <div className="mx-5 mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div>
                  <p className="text-xs font-medium text-rose-300">运行错误</p>
                  <p className="text-xs text-rose-400/80 mt-0.5">{currentRun.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Metrics row */}
          <div className="flex items-center gap-6 border-t border-slate-800/60 px-5 py-2.5 bg-slate-900/50">
            <MetricItem
              label="已完成阶段"
              value={currentRun.stages_done ?? stageNum > 0 ? String(stageNum) : '-'}
              icon={<CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
            />
            {currentRun.stages_failed != null && currentRun.stages_failed > 0 && (
              <MetricItem
                label="失败阶段"
                value={String(currentRun.stages_failed)}
                icon={<XCircle className="h-3.5 w-3.5 text-rose-400" />}
              />
            )}
            {currentRun.elapsed_sec != null && (
              <MetricItem
                label="已耗时"
                value={formatDuration(currentRun.elapsed_sec)}
                icon={<Clock className="h-3.5 w-3.5 text-slate-500" />}
              />
            )}
            <MetricItem
              label="WebSocket"
              value={eventConnected ? '已连接' : '离线'}
              icon={
                eventConnected
                  ? <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  : <WifiOff className="h-3.5 w-3.5 text-rose-400" />
              }
            />
          </div>
        </div>
      )}

      {/* Doctor / Environment Check */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowDoctor(!showDoctor)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Stethoscope className={`h-4 w-4 ${doctorReport?.overall === 'pass' ? 'text-emerald-400' : 'text-indigo-400'}`} />
            环境诊断
            {doctorReport && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                doctorReport.overall === 'pass'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}>
                {doctorReport.overall === 'pass' ? '通过' : '失败'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!doctorLoading ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleDoctor() }}
                className="flex items-center gap-1 rounded-md bg-indigo-600/30 px-2.5 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-600/50 transition-colors"
                title="运行诊断"
              >
                <RotateCw className="h-3 w-3" />
                检查
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                诊断中...
              </span>
            )}
            {showDoctor ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </div>
        </button>

        {showDoctor && (
          <div className="border-t border-slate-800 p-3 space-y-1.5">
            {!doctorReport && !doctorLoading && (
              <p className="py-2 text-center text-xs text-slate-500">点击「检查」按钮开始环境诊断</p>
            )}
            {doctorLoading && !doctorReport && (
              <div className="flex items-center justify-center gap-2 py-3">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                <span className="text-xs text-slate-400">正在检查 LLM 连接、API Key、模型可用性...</span>
              </div>
            )}
            {doctorReport && doctorReport.checks.map((check: DoctorCheck) => (
              <div key={check.name} className="flex items-start gap-2.5 rounded-md bg-slate-800/50 px-3 py-2">
                <span className="mt-0.5 shrink-0">
                  {check.status === 'pass' ? (
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                  ) : check.status === 'fail' ? (
                    <XCircle className="h-4 w-4 text-rose-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-300">{check.name}</span>
                    <span className={`text-[10px] font-medium uppercase ${
                      check.status === 'pass' ? 'text-emerald-400' :
                      check.status === 'fail' ? 'text-rose-400' : 'text-amber-400'
                    }`}>
                      {check.status === 'pass' ? '通过' : check.status === 'fail' ? '失败' : '警告'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 break-all">{check.detail}</p>
                  {check.fix && (
                    <p className="text-[11px] text-indigo-400/80 mt-0.5">修复: {check.fix}</p>
                  )}
                </div>
              </div>
            ))}
            {doctorReport && doctorReport.actionable_fixes.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-700/40 bg-amber-900/20 px-3 py-2">
                <p className="text-[11px] font-medium text-amber-300 mb-1">建议修复项</p>
                {doctorReport.actionable_fixes.map((fix, i) => (
                  <p key={i} className="text-[11px] text-amber-400/70">• {fix}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Log Stream */}
      {currentRun?.status === 'running' && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowLiveLog(!showLiveLog)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-indigo-400" />
              实时日志流
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-mono text-indigo-300">
                {currentRunLogs.length} 行
              </span>
            </div>
            {showLiveLog ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>
          {showLiveLog && (
            <div className="border-t border-slate-800">
              <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={logAutoScroll}
                    onChange={(e) => setLogAutoScroll(e.target.checked)}
                    className="h-3 w-3 rounded border-slate-600 bg-slate-800 text-indigo-500"
                  />
                  自动滚动
                </label>
              </div>
              <div className="h-64 overflow-auto bg-slate-950 px-3 py-2">
                {currentRunLogs.length === 0 ? (
                  <p className="text-xs text-slate-600">等待日志输出...</p>
                ) : (
                  <div className="space-y-0.5">
                    {currentRunLogs.map((entry, i) => (
                      <div
                        key={`${entry.timestamp}-${i}`}
                        className={`whitespace-pre-wrap font-mono text-xs leading-relaxed ${highlightLine(entry.line)}`}
                      >
                        {entry.line}
                      </div>
                    ))}
                    {logAutoScroll && (
                      <div ref={(el) => { if (el) el.scrollIntoView({ behavior: 'smooth' }) }} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <HITLPanel runId={currentRun?.run_id || ''} waiting={hitlWaiting} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineTimeline
            stages={stages}
            stageMap={stageMap}
            currentStage={stageNum}
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

      <NewTaskModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onStart={handleStart}
        loading={loading}
      />
    </div>
  )
}

// ── Helper components ──────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    running: 'bg-indigo-500/20 text-indigo-300 border-indigo-700/40',
    idle: 'bg-slate-800 text-slate-400 border-slate-700',
    completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-700/40',
    failed: 'bg-rose-500/20 text-rose-300 border-rose-700/40',
    stopped: 'bg-amber-500/20 text-amber-300 border-amber-700/40',
    starting: 'bg-indigo-500/20 text-indigo-300 border-indigo-700/40',
    interrupted: 'bg-amber-500/20 text-amber-300 border-amber-700/40',
  }

  const labelMap: Record<string, string> = {
    running: '运行中',
    idle: '空闲',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
    starting: '启动中',
    interrupted: '已中断',
  }

  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorMap[status] || colorMap.idle}`}>
      {labelMap[status] || status}
    </span>
  )
}

function MetricItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      {icon}
      <span>{label}:</span>
      <span className="font-mono text-slate-300">{value}</span>
    </div>
  )
}

function isRunning(run: { status: string }) {
  return run.status === 'running' || run.status === 'starting'
}
function isCompleted(run: { status: string }) {
  return run.status === 'completed' || run.status === 'done'
}
function isFailed(run: { status: string }) {
  return run.status === 'failed'
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}
