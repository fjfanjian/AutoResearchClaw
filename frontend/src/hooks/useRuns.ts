import { useState, useEffect, useCallback } from 'react'
import { api } from '@/api/client'
import type { RunSummary } from '@/types'

export function useRuns() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listRuns()
      setRuns(data.runs)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch runs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10000)
    return () => clearInterval(id)
  }, [refresh])

  return { runs, loading, error, refresh }
}
