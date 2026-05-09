import React, { createContext, useContext, useReducer, useCallback } from 'react'
import type { ActiveRunState, NotificationItem, RunSummary } from '@/types'

export interface LiveLogEntry {
  runId: string
  line: string
  timestamp: number
}

export interface StageEvent {
  stage: number
  stageName: string
  status: string
  timestamp: number
}

interface AppState {
  currentRun: ActiveRunState | null
  runs: RunSummary[]
  notifications: NotificationItem[]
  sidebarCollapsed: boolean
  theme: 'dark'
  liveLogs: LiveLogEntry[]
  stageEvents: StageEvent[]
  eventConnected: boolean
}

type Action =
  | { type: 'SET_CURRENT_RUN'; payload: ActiveRunState | null }
  | { type: 'SET_RUNS'; payload: RunSummary[] }
  | { type: 'ADD_NOTIFICATION'; payload: NotificationItem }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'ADD_LIVE_LOG'; payload: LiveLogEntry }
  | { type: 'CLEAR_LIVE_LOGS' }
  | { type: 'ADD_STAGE_EVENT'; payload: StageEvent }
  | { type: 'SET_EVENT_CONNECTED'; payload: boolean }

const initialState: AppState = {
  currentRun: null,
  runs: [],
  notifications: [],
  sidebarCollapsed: false,
  theme: 'dark',
  liveLogs: [],
  stageEvents: [],
  eventConnected: false,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CURRENT_RUN':
      return { ...state, currentRun: action.payload }
    case 'SET_RUNS':
      return { ...state, runs: action.payload }
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [action.payload, ...state.notifications].slice(0, 20) }
    case 'REMOVE_NOTIFICATION':
      return { ...state, notifications: state.notifications.filter((n) => n.id !== action.payload) }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'ADD_LIVE_LOG': {
      const logs = [...state.liveLogs, action.payload]
      if (logs.length > 500) {
        return { ...state, liveLogs: logs.slice(-500) }
      }
      return { ...state, liveLogs: logs }
    }
    case 'CLEAR_LIVE_LOGS':
      return { ...state, liveLogs: [], stageEvents: [] }
    case 'ADD_STAGE_EVENT':
      return { ...state, stageEvents: [...state.stageEvents, action.payload] }
    case 'SET_EVENT_CONNECTED':
      return { ...state, eventConnected: action.payload }
    default:
      return state
  }
}

const AppContext = createContext<{
  state: AppState
  dispatch: React.Dispatch<Action>
} | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx.state
}

export function useAppDispatch() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider')
  return ctx.dispatch
}

export function useNotify() {
  const dispatch = useAppDispatch()
  return useCallback(
    (title: string, level: NotificationItem['level'] = 'info', detail?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      dispatch({ type: 'ADD_NOTIFICATION', payload: { id, title, level, detail, timestamp: Date.now() } })
      setTimeout(() => dispatch({ type: 'REMOVE_NOTIFICATION', payload: id }), 5000)
    },
    [dispatch]
  )
}
