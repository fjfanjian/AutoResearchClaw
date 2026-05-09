import { useCallback } from 'react'
import { useWebSocket } from './useWebSocket'
import type { EventMessage } from '@/types'
import { useAppDispatch } from '@/context/AppContext'

export function useEventStream() {
  const dispatch = useAppDispatch()

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as EventMessage

      switch (event.type) {
        case 'connected':
          dispatch({ type: 'SET_EVENT_CONNECTED', payload: true })
          break
        case 'pipeline_started':
          dispatch({
            type: 'SET_CURRENT_RUN',
            payload: event.data as any,
          })
          dispatch({ type: 'CLEAR_LIVE_LOGS' })
          break
        case 'pipeline_completed':
          dispatch({
            type: 'SET_CURRENT_RUN',
            payload: event.data as any,
          })
          break
        case 'stage_start': {
          const stage = event.data?.stage as number
          const stageName = event.data?.stage_name as string
          dispatch({
            type: 'ADD_STAGE_EVENT',
            payload: {
              stage,
              stageName: stageName || `阶段 ${stage}`,
              status: 'running',
              timestamp: event.timestamp || Date.now(),
            },
          })
          dispatch({
            type: 'SET_CURRENT_RUN',
            payload: event.data as any,
          })
          break
        }
        case 'stage_complete': {
          const stage = event.data?.stage as number
          const stageName = event.data?.stage_name as string
          dispatch({
            type: 'ADD_STAGE_EVENT',
            payload: {
              stage,
              stageName: stageName || `阶段 ${stage}`,
              status: 'done',
              timestamp: event.timestamp || Date.now(),
            },
          })
          dispatch({
            type: 'SET_CURRENT_RUN',
            payload: event.data as any,
          })
          break
        }
        case 'stage_fail': {
          const stage = event.data?.stage as number
          const stageName = event.data?.stage_name as string
          dispatch({
            type: 'ADD_STAGE_EVENT',
            payload: {
              stage,
              stageName: stageName || `阶段 ${stage}`,
              status: 'failed',
              timestamp: event.timestamp || Date.now(),
            },
          })
          break
        }
        case 'log_line': {
          const line = event.data?.line as string
          const runId = (event.data?.run_id as string) || 'current'
          if (line) {
            dispatch({
              type: 'ADD_LIVE_LOG',
              payload: { runId, line, timestamp: event.timestamp || Date.now() },
            })
          }
          break
        }
        case 'run_discovered':
        case 'run_status_changed':
          // Runs list refresh handled by polling
          break
      }
    },
    [dispatch]
  )

  const handleClose = useCallback(() => {
    dispatch({ type: 'SET_EVENT_CONNECTED', payload: false })
  }, [dispatch])

  const handleOpen = useCallback(() => {
    dispatch({ type: 'SET_EVENT_CONNECTED', payload: true })
  }, [dispatch])

  const { readyState } = useWebSocket({
    url: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/events`,
    onMessage: handleMessage,
    onOpen: handleOpen,
    onClose: handleClose,
    reconnect: true,
    reconnectInterval: 5000,
  })

  return { connected: readyState === WebSocket.OPEN }
}
