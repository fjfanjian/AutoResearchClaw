import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, RotateCcw, Wifi, WifiOff } from 'lucide-react'
import { api } from '@/api/client'
import { useAppState } from '@/context/AppContext'

interface Props {
  runId: string
}

export default function LogViewer({ runId }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [tail, setTail] = useState(200)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { liveLogs, eventConnected, currentRun } = useAppState()

  // Determine if this run is currently active
  const isActiveRun = currentRun?.run_id === runId && currentRun?.status === 'running'

  // Filter live logs for this run
  const runLiveLogs = useMemo(() => {
    if (!isActiveRun) return []
    return liveLogs.filter((l) => l.runId === runId || l.runId === 'current')
  }, [liveLogs, runId, isActiveRun])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await api.getLogs(runId, tail)
      setLines(res.lines)
    } catch {
      setLines([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    intervalRef.current = setInterval(fetchLogs, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [runId, tail])

  // Auto-scroll for active runs with live logs
  useEffect(() => {
    if (isActiveRun && runLiveLogs.length > 0) {
      const container = containerRef.current
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
        if (isNearBottom) {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
      }
    }
  }, [runLiveLogs, isActiveRun])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  // Combine historical + live logs for active runs
  const displayLines = isActiveRun
    ? [...lines, ...runLiveLogs.map((l) => l.line)]
    : lines

  const filtered = filter
    ? displayLines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : displayLines

  const highlightLine = (line: string) => {
    if (line.includes('ERROR') || line.includes('CRITICAL')) {
      return 'text-rose-300'
    }
    if (line.includes('WARNING') || line.includes('BUDGET EXCEEDED')) {
      return 'text-amber-300'
    }
    if (line.includes('SUCCESS') || line.includes('Done') || line.includes('completed')) {
      return 'text-emerald-300'
    }
    if (line.includes('INFO')) {
      return 'text-blue-300'
    }
    return 'text-slate-400'
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选日志..."
            className="w-full rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <select
          value={tail}
          onChange={(e) => setTail(Number(e.target.value))}
          className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
        >
          <option value={50}>50 行</option>
          <option value={100}>100 行</option>
          <option value={200}>200 行</option>
          <option value={500}>500 行</option>
          <option value={1000}>1000 行</option>
        </select>
        <button onClick={fetchLogs} className="btn-ghost px-2 py-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        {isActiveRun && (
          <span className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs" title="实时事件连接">
            {eventConnected ? (
              <>
                <Wifi className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">实时</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-rose-400" />
                <span className="text-rose-400">离线</span>
              </>
            )}
          </span>
        )}
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3">
        {filtered.length === 0 && !loading && (
          <p className="text-xs text-slate-500">暂无日志</p>
        )}
        {filtered.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap font-mono text-xs leading-relaxed ${highlightLine(line)}`}>
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {isActiveRun && runLiveLogs.length > 0 && (
        <p className="text-xs text-indigo-400">
          已接收 {runLiveLogs.length} 条实时日志
        </p>
      )}
    </div>
  )
}
