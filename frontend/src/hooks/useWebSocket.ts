/**
 * Generic WebSocket hook with auto-reconnect and heartbeat support.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface UseWebSocketOptions {
  url: string
  onMessage?: (data: string) => void
  reconnectDelay?: number
  maxRetries?: number
  enabled?: boolean
}

export interface UseWebSocketReturn {
  status: WSStatus
  send: (data: string) => void
  disconnect: () => void
}

export function useWebSocket({
  url,
  onMessage,
  reconnectDelay = 3000,
  maxRetries = 10,
  enabled = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [status, setStatus] = useState<WSStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return
    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      setStatus('connected')
      retriesRef.current = 0
    }

    ws.onmessage = (ev) => {
      onMessageRef.current?.(ev.data as string)
    }

    ws.onerror = () => {
      setStatus('error')
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('disconnected')
      wsRef.current = null
      if (retriesRef.current < maxRetries) {
        retriesRef.current += 1
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) connect()
        }, reconnectDelay)
      }
    }
  }, [url, reconnectDelay, maxRetries, enabled])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect, enabled])

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  const disconnect = useCallback(() => {
    mountedRef.current = false
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    wsRef.current?.close()
    setStatus('disconnected')
  }, [])

  return { status, send, disconnect }
}
