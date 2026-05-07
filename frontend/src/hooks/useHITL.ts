/**
 * Hook for /ws/hitl/{run_id} — bidirectional HITL channel.
 * Provides typed send helpers for all HITL actions.
 */
import { useCallback, useState } from 'react'
import type { HITLState } from '../types'
import { useWebSocket, type WSStatus } from './useWebSocket'
import { wsUrl } from '../utils/websocket'

interface UseHITLReturn {
  status: WSStatus
  hitlState: HITLState | null
  chatMessages: Array<{ role: 'human' | 'assistant'; content: string }>
  approve: (message?: string) => void
  reject: (reason?: string) => void
  edit: (files: Record<string, string>) => void
  injectGuidance: (stage: number, guidance: string) => void
  sendChat: (content: string) => void
  requestStatus: () => void
}

export function useHITL(runId: string | null): UseHITLReturn {
  const [hitlState, setHitlState] = useState<HITLState | null>(null)
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'human' | 'assistant'; content: string }>
  >([])

  const handleMessage = useCallback(
    (raw: string) => {
      try {
        const msg = JSON.parse(raw) as Record<string, unknown>
        if (msg.type === 'status_update') {
          setHitlState((prev) => ({
            run_id: runId ?? '',
            waiting:
              (msg.waiting as HITLState['waiting']) ??
              prev?.waiting ??
              null,
            session:
              (msg.session as HITLState['session']) ??
              prev?.session ??
              null,
          }))
        } else if (msg.type === 'chat_response') {
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: String(msg.content ?? '') },
          ])
        }
      } catch {
        // ignore
      }
    },
    [runId],
  )

  const { status, send } = useWebSocket({
    url: wsUrl(`/ws/hitl/${runId}`),
    onMessage: handleMessage,
    enabled: !!runId,
  })

  const approve = useCallback(
    (message = '') => send(JSON.stringify({ type: 'approve', message })),
    [send],
  )

  const reject = useCallback(
    (reason = '') => send(JSON.stringify({ type: 'reject', reason })),
    [send],
  )

  const edit = useCallback(
    (files: Record<string, string>) =>
      send(JSON.stringify({ type: 'edit', files })),
    [send],
  )

  const injectGuidance = useCallback(
    (stage: number, guidance: string) =>
      send(JSON.stringify({ type: 'inject_guidance', stage, guidance })),
    [send],
  )

  const sendChat = useCallback(
    (content: string) => {
      setChatMessages((prev) => [...prev, { role: 'human', content }])
      send(JSON.stringify({ type: 'chat_message', content }))
    },
    [send],
  )

  const requestStatus = useCallback(
    () => send(JSON.stringify({ type: 'get_status' })),
    [send],
  )

  return {
    status,
    hitlState,
    chatMessages,
    approve,
    reject,
    edit,
    injectGuidance,
    sendChat,
    requestStatus,
  }
}
