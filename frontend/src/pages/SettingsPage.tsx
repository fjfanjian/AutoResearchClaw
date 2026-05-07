import { useApp } from '../context/AppContext'
import { useEffect, useState } from 'react'
import { fetchConfig, fetchHealth } from '../api/client'

export function SettingsPage() {
  const { state, wsStatus } = useApp()
  const { pipeline } = state
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {})
    fetchHealth().then(setHealth).catch(() => {})
  }, [])

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-lg font-semibold">Settings & Status</h1>

      {/* Server health */}
      <section className="bg-surface-raised border border-surface-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-medium">Server Health</h2>
        {health ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted">Status</p>
              <p className="text-success font-medium">{String(health.status)}</p>
            </div>
            <div>
              <p className="text-muted">Version</p>
              <p className="font-mono">{String(health.version ?? '—')}</p>
            </div>
            <div>
              <p className="text-muted">WebSocket Connections</p>
              <p className="font-mono">{String(health.active_connections ?? 0)}</p>
            </div>
            <div>
              <p className="text-muted">Dashboard WS</p>
              <p
                className={
                  wsStatus === 'connected' ? 'text-success' : 'text-warning'
                }
              >
                {wsStatus}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted animate-pulse">Loading…</p>
        )}
      </section>

      {/* Pipeline config */}
      <section className="bg-surface-raised border border-surface-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-medium">Pipeline Configuration</h2>
        {config ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            {Object.entries(config).map(([k, v]) => (
              typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                ? (
                  <div key={k}>
                    <p className="text-muted capitalize">{k.replace(/_/g, ' ')}</p>
                    <p className="font-mono">{String(v)}</p>
                  </div>
                )
                : null
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted animate-pulse">Loading…</p>
        )}
      </section>

      {/* Pipeline state */}
      <section className="bg-surface-raised border border-surface-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-medium">Current Pipeline State</h2>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted">Status</p>
            <p className="font-mono">{pipeline.status}</p>
          </div>
          {pipeline.run_id && (
            <div>
              <p className="text-muted">Run ID</p>
              <p className="font-mono">{pipeline.run_id}</p>
            </div>
          )}
          {pipeline.topic && (
            <div className="col-span-2">
              <p className="text-muted">Topic</p>
              <p>{pipeline.topic}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
