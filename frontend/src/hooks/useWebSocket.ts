import { useEffect, useRef, useState, useCallback } from 'react'

export interface UseWebSocketOptions {
  url: string
  onMessage?: (data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (err: Event) => void
  reconnect?: boolean
  reconnectInterval?: number
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnect = true,
  reconnectInterval = 3000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnect = useRef(reconnect)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setReadyState(WebSocket.OPEN)
        onOpen?.()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessage?.(data)
        } catch {
          onMessage?.(event.data)
        }
      }

      ws.onclose = () => {
        setReadyState(WebSocket.CLOSED)
        wsRef.current = null
        onClose?.()
        if (shouldReconnect.current) {
          timerRef.current = setTimeout(connect, reconnectInterval)
        }
      }

      ws.onerror = (err) => {
        onError?.(err)
      }
    } catch {
      if (shouldReconnect.current) {
        timerRef.current = setTimeout(connect, reconnectInterval)
      }
    }
  }, [url, onMessage, onOpen, onClose, onError, reconnectInterval])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }, [])

  const disconnect = useCallback(() => {
    shouldReconnect.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  useEffect(() => {
    shouldReconnect.current = reconnect
    connect()
    return () => {
      shouldReconnect.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [connect, reconnect])

  return { send, disconnect, readyState }
}
