import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useAppState, useAppDispatch } from '@/context/AppContext'

const icons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
}

const styles = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
}

export default function NotificationToast() {
  const { notifications } = useAppState()
  const dispatch = useAppDispatch()

  if (notifications.length === 0) return null

  return (
    <div className="fixed right-4 top-16 z-50 flex w-80 flex-col gap-2">
      {notifications.map((n) => {
        const Icon = icons[n.level]
        return (
          <div
            key={n.id}
            className={`animate-fade-in flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${styles[n.level]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">{n.title}</p>
              {n.detail && (
                <p className="mt-0.5 text-xs opacity-80">{n.detail}</p>
              )}
            </div>
            <button
              onClick={() => dispatch({ type: 'REMOVE_NOTIFICATION', payload: n.id })}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
