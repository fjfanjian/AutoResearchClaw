import { useState, useEffect } from 'react'
import { Settings, Server, BookOpen, Activity } from 'lucide-react'
import { api } from '@/api/client'
import type { ConfigSummary } from '@/types'

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigSummary | null>(null)
  const [health, setHealth] = useState<{ status: string; version: string; active_connections: number } | null>(null)

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null))
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
        <Settings className="h-5 w-5 text-indigo-400" />
        设置
      </h1>

      {health && (
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            服务健康
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-md bg-slate-800/60 p-3">
              <p className="text-xs text-slate-500">状态</p>
              <p className="mt-1 text-sm font-medium text-emerald-300">{health.status}</p>
            </div>
            <div className="rounded-md bg-slate-800/60 p-3">
              <p className="text-xs text-slate-500">版本</p>
              <p className="mt-1 text-sm font-mono text-slate-200">{health.version}</p>
            </div>
            <div className="rounded-md bg-slate-800/60 p-3">
              <p className="text-xs text-slate-500">连接数</p>
              <p className="mt-1 text-sm font-mono text-slate-200">{health.active_connections}</p>
            </div>
          </div>
        </div>
      )}

      {config && (
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Server className="h-4 w-4 text-indigo-400" />
            配置
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">项目</span>
              <span className="text-sm text-slate-200">{config.project}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">主题</span>
              <span className="text-sm text-slate-200">{config.topic}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">模式</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{config.mode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">语音启用</span>
              <span className="text-sm text-slate-200">{config.server.voice_enabled ? '是' : '否'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">仪表板启用</span>
              <span className="text-sm text-slate-200">{config.server.dashboard_enabled ? '是' : '否'}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-amber-400" />
          快捷操作
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              fetch('/api/health').then((r) => r.json()).then((d) => alert(JSON.stringify(d, null, 2)))
            }}
            className="btn-secondary text-xs"
          >
            检查健康
          </button>
        </div>
      </div>
    </div>
  )
}
