/**
 * Global application state: current run, notifications queue, theme.
 * Real-time pipeline state is driven by the /ws/events WebSocket.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react'
import type {
  Notification,
  NotificationLevel,
  PipelineStatus,
  StageState,
  StageStatus,
  WSEvent,
} from '../types'
import { fetchPipelineStages, fetchPipelineStatus } from '../api/client'
import { useEventStream } from '../hooks/useEventStream'

// ─── State ────────────────────────────────────────────────────────────────────

interface AppState {
  pipeline: PipelineStatus
  stages: StageState[]
  notifications: Notification[]
  activeRunId: string | null
}

const initialState: AppState = {
  pipeline: { status: 'idle' },
  stages: [],
  notifications: [],
  activeRunId: null,
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_PIPELINE'; payload: PipelineStatus }
  | { type: 'SET_STAGES'; payload: StageState[] }
  | { type: 'UPDATE_STAGE'; payload: { number: number; patch: Partial<StageState> } }
  | { type: 'SET_ACTIVE_RUN'; payload: string | null }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'DISMISS_NOTIFICATION'; payload: string }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PIPELINE':
      return { ...state, pipeline: action.payload }
    case 'SET_STAGES':
      return { ...state, stages: action.payload }
    case 'UPDATE_STAGE':
      return {
        ...state,
        stages: state.stages.map((s) =>
          s.number === action.payload.number
            ? { ...s, ...action.payload.patch }
            : s,
        ),
      }
    case 'SET_ACTIVE_RUN':
      return { ...state, activeRunId: action.payload }
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [action.payload, ...state.notifications].slice(0, 20),
      }
    case 'DISMISS_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(
          (n) => n.id !== action.payload,
        ),
      }
    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  notify: (title: string, level?: NotificationLevel, detail?: string) => void
  wsStatus: string
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Keep a stable ref to dispatch so event handler doesn't re-create on state changes
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch

  // ── Bootstrap: load pipeline status & stage definitions ──────────────────
  useEffect(() => {
    fetchPipelineStatus()
      .then((status) => {
        dispatchRef.current({ type: 'SET_PIPELINE', payload: status })
        if (status.run_id) {
          dispatchRef.current({ type: 'SET_ACTIVE_RUN', payload: status.run_id })
        }
      })
      .catch(() => {})

    fetchPipelineStages()
      .then(({ stages }) => {
        const stageStates: StageState[] = stages.map((s) => ({
          number: s.number,
          name: s.name,
          label: s.label,
          phase: s.phase,
          status: 'pending',
        }))
        dispatchRef.current({ type: 'SET_STAGES', payload: stageStates })
      })
      .catch(() => {})
  }, [])

  // ── Notification helper ───────────────────────────────────────────────────
  const notify = useCallback(
    (title: string, level: NotificationLevel = 'info', detail?: string) => {
      dispatchRef.current({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: `${Date.now()}-${Math.random()}`,
          title,
          detail,
          level,
          timestamp: Date.now(),
        },
      })
    },
    [],
  )

  // ── WebSocket event handler — stable (no deps on changing state) ──────────
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const handleEvent = useCallback((event: WSEvent) => {
    const d = dispatchRef.current
    const n = notifyRef.current
    switch (event.type) {
      case 'pipeline_started':
        d({
          type: 'SET_PIPELINE',
          payload: {
            status: 'running',
            run_id: event.data.run_id as string | undefined,
            topic: event.data.topic as string | undefined,
          },
        })
        if (event.data.run_id) {
          d({ type: 'SET_ACTIVE_RUN', payload: event.data.run_id as string })
        }
        break

      case 'pipeline_completed':
        d({ type: 'SET_PIPELINE', payload: { status: 'completed' } })
        n('Pipeline completed!', 'success')
        break

      case 'stage_start':
        d({
          type: 'UPDATE_STAGE',
          payload: {
            number: event.data.stage as number,
            patch: { status: 'running', started_at: new Date().toISOString() },
          },
        })
        break

      case 'stage_complete':
        d({
          type: 'UPDATE_STAGE',
          payload: {
            number: event.data.stage as number,
            patch: {
              status: 'done' as StageStatus,
              completed_at: new Date().toISOString(),
              duration_sec: event.data.duration_sec as number | undefined,
            },
          },
        })
        break

      case 'stage_fail':
        d({
          type: 'UPDATE_STAGE',
          payload: {
            number: event.data.stage as number,
            patch: {
              status: 'failed' as StageStatus,
              error: event.data.error as string | undefined,
            },
          },
        })
        n(
          `Stage ${event.data.stage as number} failed`,
          'error',
          event.data.error as string | undefined,
        )
        break

      default:
        break
    }
  }, [])

  const { status: wsStatus } = useEventStream({ onEvent: handleEvent })

  return (
    <AppContext.Provider value={{ state, dispatch, notify, wsStatus }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
