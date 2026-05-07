import { useState } from 'react'
import { Play, Square, Wifi, WifiOff } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { startPipeline, stopPipeline } from '../api/client'

export function TopBar() {
  const { state, dispatch, notify, wsStatus } = useApp()
  const { pipeline } = state
  const [showStart, setShowStart] = useState(false)
  const [topic, setTopic] = useState('')
  const [autoApprove, setAutoApprove] = useState(true)
  const [loading, setLoading] = useState(false)

  const isRunning = pipeline.status === 'running'

  async function handleStart() {
    if (!topic.trim()) return
    setLoading(true)
    try {
      const res = await startPipeline(topic.trim(), autoApprove)
      dispatch({
        type: 'SET_PIPELINE',
        payload: { status: 'running', run_id: res.run_id, topic: topic.trim() },
      })
      dispatch({ type: 'SET_ACTIVE_RUN', payload: res.run_id })
      notify(`Started run ${res.run_id}`, 'success')
      setShowStart(false)
      setTopic('')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to start', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleStop() {
    try {
      await stopPipeline()
      dispatch({ type: 'SET_PIPELINE', payload: { ...pipeline, status: 'stopped' } })
      notify('Pipeline stopped', 'warning')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to stop', 'error')
    }
  }

  const statusColor = {
    idle: 'text-muted',
    running: 'text-success',
    completed: 'text-accent',
    failed: 'text-danger',
    stopped: 'text-warning',
  }[pipeline.status] ?? 'text-muted'

  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-surface-border bg-surface-raised shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-accent font-bold tracking-tight">🦞</span>
        <span className="font-semibold text-sm hidden sm:inline">ResearchClaw</span>
      </div>

      {/* Current run info */}
      <div className="flex items-center gap-3 text-xs text-muted">
        {pipeline.run_id && (
          <span className="font-mono hidden md:inline">{pipeline.run_id}</span>
        )}
        {pipeline.topic && (
          <span className="hidden lg:inline truncate max-w-xs">{pipeline.topic}</span>
        )}
        <span className={`font-medium ${statusColor}`}>{pipeline.status}</span>
        {/* WS indicator */}
        {wsStatus === 'connected' ? (
          <Wifi size={14} className="text-success" />
        ) : (
          <WifiOff size={14} className="text-muted animate-pulse" />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isRunning ? (
          <button
            onClick={() => { void handleStop() }}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs bg-danger/20 text-danger hover:bg-danger/30 transition-colors"
          >
            <Square size={12} /> Stop
          </button>
        ) : (
          <button
            onClick={() => setShowStart(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            <Play size={12} /> Start
          </button>
        )}
      </div>

      {/* Start modal */}
      {showStart && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface-overlay border border-surface-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold mb-4">Start Pipeline</h2>
            <label className="block text-xs text-muted mb-1">Research Topic</label>
            <input
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent mb-3"
              placeholder="e.g. Vision Transformer on VisDrone dataset"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleStart() }}
              autoFocus
            />
            <label className="flex items-center gap-2 text-sm text-muted mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="accent-accent"
              />
              Auto-approve gate stages
            </label>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowStart(false)}
                className="px-4 py-1.5 rounded text-sm text-muted hover:text-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleStart() }}
                disabled={loading || !topic.trim()}
                className="px-4 py-1.5 rounded text-sm bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Starting…' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
