import { useState, useCallback, useEffect } from 'react'
import { useWebSocket } from './useWebSocket'
import type { HITLStatus, InboundHITLMessage, OutboundHITLMessage } from '@/types'
import { useNotify } from '@/context/AppContext'

export function useHITL(runId: string | null) {
  const [status, setStatus] = useState<HITLStatus>({ session: null, waiting: null })
  const [chatMessages, setChatMessages] = useState<{ role: 'human' | 'ai'; content: string }[]>([])
  const notify = useNotify()

  const handleMessage = useCallback(
    (data: unknown) => {
      const msg = data as OutboundHITLMessage
      if (msg.type === 'status_update') {
        setStatus({
          session: msg.session as any,
          waiting: msg.waiting as any,
        })
      }
      if (msg.type === 'chat_response') {
        setChatMessages((prev) => [...prev, { role: 'ai', content: msg.content }])
      }
      if (msg.type === 'notification') {
        notify(msg.title, msg.level, msg.detail)
      }
    },
    [notify]
  )

  const url = runId
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/hitl/${runId}`
    : ''

  const { send, readyState } = useWebSocket({
    url,
    onMessage: handleMessage,
    reconnect: true,
    reconnectInterval: 3000,
  })

  const isConnected = readyState === WebSocket.OPEN

  const sendAction = useCallback(
    (msg: InboundHITLMessage) => {
      if (isConnected) {
        send(msg)
        if (msg.type === 'chat_message') {
          setChatMessages((prev) => [...prev, { role: 'human', content: msg.content }])
        }
      }
    },
    [send, isConnected]
  )

  const approve = useCallback(
    (message?: string) => sendAction({ type: 'approve', message }),
    [sendAction]
  )
  const reject = useCallback(
    (reason?: string) => sendAction({ type: 'reject', reason }),
    [sendAction]
  )
  const edit = useCallback(
    (files: Record<string, string>) => sendAction({ type: 'edit', files }),
    [sendAction]
  )
  const injectGuidance = useCallback(
    (stage: number, guidance: string) =>
      sendAction({ type: 'inject_guidance', stage, guidance }),
    [sendAction]
  )
  const sendChat = useCallback(
    (content: string) => sendAction({ type: 'chat_message', content }),
    [sendAction]
  )
  const getStatus = useCallback(() => sendAction({ type: 'get_status' }), [sendAction])

  useEffect(() => {
    if (isConnected && runId) {
      getStatus()
    }
  }, [isConnected, runId, getStatus])

  return {
    status,
    isConnected,
    chatMessages,
    approve,
    reject,
    edit,
    injectGuidance,
    sendChat,
    getStatus,
  }
}
