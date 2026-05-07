import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { Notification, NotificationLevel } from '../types'

const levelStyles: Record<NotificationLevel, string> = {
  info: 'border-accent bg-surface-overlay text-gray-100',
  success: 'border-success bg-surface-overlay text-gray-100',
  warning: 'border-warning bg-surface-overlay text-gray-100',
  error: 'border-danger bg-surface-overlay text-gray-100',
}

const levelDot: Record<NotificationLevel, string> = {
  info: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
}

function Toast({ n, onDismiss }: { n: Notification; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000)
    return () => clearTimeout(id)
  }, [onDismiss])

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg max-w-sm w-full ${levelStyles[n.level]} animate-slide-in`}
    >
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${levelDot[n.level]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{n.title}</p>
        {n.detail && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.detail}</p>
        )}
      </div>
      <button onClick={onDismiss} className="text-muted hover:text-gray-100 shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}

export function NotificationToast() {
  const { state, dispatch } = useApp()
  const { notifications } = state

  const [visible, setVisible] = useState<Notification[]>([])

  useEffect(() => {
    setVisible(notifications.slice(0, 5))
  }, [notifications])

  if (visible.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      {visible.map((n) => (
        <Toast
          key={n.id}
          n={n}
          onDismiss={() =>
            dispatch({ type: 'DISMISS_NOTIFICATION', payload: n.id })
          }
        />
      ))}
    </div>
  )
}
