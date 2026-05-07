import React, { createContext, useContext, useReducer, useCallback } from 'react'
import type { ActiveRunState, NotificationItem, RunSummary } from '@/types'

interface AppState {
  currentRun: ActiveRunState | null
  runs: RunSummary[]
  notifications: NotificationItem[]
  sidebarCollapsed: boolean
  theme: 'dark'
}

type Action =
  | { type: 'SET_CURRENT_RUN'; payload: ActiveRunState | null }
  | { type: 'SET_RUNS'; payload: RunSummary[] }
  | { type: 'ADD_NOTIFICATION'; payload: NotificationItem }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'TOGGLE_SIDEBAR' }

const initialState: AppState = {
  currentRun: null,
  runs: [],
  notifications: [],
  sidebarCollapsed: false,
  theme: 'dark',
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
