/**
 * Hook for /ws/events — the global pipeline event stream.
 * Parses incoming JSON events and dispatches them to a callback.
 */
import { useCallback } from 'react'
import type { WSEvent } from '../types'
import { useWebSocket, type UseWebSocketReturn } from './useWebSocket'
import { wsUrl } from '../utils/websocket'

interface UseEventStreamOptions {
  onEvent: (event: WSEvent) => void
  enabled?: boolean
}

export function useEventStream({
  onEvent,
  enabled = true,
}: UseEventStreamOptions): UseWebSocketReturn {
  const handleMessage = useCallback(
    (raw: string) => {
      try {
        const event = JSON.parse(raw) as WSEvent
        onEvent(event)
      } catch {
        // ignore malformed frames
      }
    },
    [onEvent],
  )

  return useWebSocket({
    url: wsUrl('/ws/events'),
    onMessage: handleMessage,
    enabled,
  })
}
