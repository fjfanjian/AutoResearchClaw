import { useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { fetchLogs } from '../api/client'

interface Props {
  runId: string
  tail?: number
  /** If true, auto-polls every `pollMs` ms */
  polling?: boolean
  pollMs?: number
}

export function LogViewer({ runId, tail = 200, polling = false, pollMs = 3000 }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const load = useCallback(async () => {
    try {
      const text = await fetchLogs(runId, tail)
      setLines(text.split('\n'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs')
    } finally {
      setLoading(false)
    }
  }, [runId, tail])

  useEffect(() => {
    void load()
    if (polling) {
      const id = setInterval(() => { void load() }, pollMs)
      return () => clearInterval(id)
    }
    return undefined
  }, [load, polling, pollMs])

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll])

  const filtered = filter
    ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : lines

  function highlight(line: string) {
    if (line.includes('ERROR') || line.includes('CRITICAL'))
      return 'text-danger'
    if (line.includes('WARNING') || line.includes('WARN'))
      return 'text-warning'
    if (line.includes('Stage') && line.includes('done'))
      return 'text-success'
    return 'text-gray-300'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-border shrink-0">
        <Search size={13} className="text-muted" />
        <input
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder-muted"
          placeholder="Filter logs…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-accent"
          />
          Auto-scroll
        </label>
        <button
          onClick={() => { void load() }}
          className="text-xs text-accent hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* Log content */}
      <div className="flex-1 overflow-auto bg-surface p-3 font-mono text-xs">
        {loading && <p className="text-muted animate-pulse">Loading…</p>}
        {error && <p className="text-danger">{error}</p>}
        {!loading && !error && (
          <>
            {filtered.map((line, i) => (
              <div key={i} className={`${highlight(line)} leading-relaxed whitespace-pre-wrap break-all`}>
                {line || '\u00A0'}
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
