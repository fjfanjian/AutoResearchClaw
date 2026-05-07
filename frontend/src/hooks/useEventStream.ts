import { useCallback } from 'react'
import { useWebSocket } from './useWebSocket'
import type { EventMessage } from '@/types'
import { useAppDispatch } from '@/context/AppContext'

export function useEventStream() {
  const dispatch = useAppDispatch()

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as EventMessage
      if (event.type === 'run_discovered' || event.type === 'run_status_changed') {
        // Refresh runs list on run changes
        // In a real app we might merge directly, but for simplicity we rely on polling
      }
      if (event.type === 'pipeline_started' || event.type === 'pipeline_completed') {
        dispatch({
          type: 'SET_CURRENT_RUN',
          payload: event.data as any,
        })
      }
    },
    [dispatch]
  )

  const { readyState } = useWebSocket({
    url: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/events`,
    onMessage: handleMessage,
    reconnect: true,
    reconnectInterval: 5000,
  })

  return { connected: readyState === WebSocket.OPEN }
}
