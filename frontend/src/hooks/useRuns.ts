/**
 * Hook to fetch and refresh the list of pipeline runs.
 */
import { useCallback, useEffect, useState } from 'react'
import { fetchRuns } from '../api/client'
import type { Run } from '../types'

interface UseRunsReturn {
  runs: Run[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useRuns(pollingMs = 0): UseRunsReturn {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchRuns()
      setRuns(data.runs)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (pollingMs > 0) {
      const id = setInterval(() => { void refresh() }, pollingMs)
      return () => clearInterval(id)
    }
    return undefined
  }, [refresh, pollingMs])

  return { runs, loading, error, refresh }
}
