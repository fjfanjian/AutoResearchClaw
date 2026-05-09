import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, FileText, Save, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { api } from '@/api/client'
import type { ConfigGroup, FieldMeta } from '@/types'
import ConfigForm from '@/components/ConfigForm'

type StatusMessage = { type: 'success' | 'error'; text: string } | null

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [configPath, setConfigPath] = useState('')
  const [fieldMeta, setFieldMeta] = useState<Record<string, FieldMeta>>({})
  const [groups, setGroups] = useState<ConfigGroup[]>([])
  const [activeGroup, setActiveGroup] = useState('project')
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMessage>(null)
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load data ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [fullCfg, fieldsRes] = await Promise.all([
        api.fullConfig(),
        api.configFields(),
      ])
      setConfig(fullCfg.config)
      setConfigPath(fullCfg.config_path)
      setFieldMeta(fieldsRes.fields)
      setGroups(fieldsRes.groups)
      if (fieldsRes.groups.length > 0) {
        setActiveGroup((prev) =>
          fieldsRes.groups.some((g) => g.key === prev) ? prev : fieldsRes.groups[0].key,
        )
      }
      // Reset dirty state
      setDirtyFields({})
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Field change handler ────────────────────────────────────────

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      setDirtyFields((prev) => {
        const next = { ...prev }
        if (value === undefined || value === null) {
          delete next[key]
        } else {
          next[key] = value
        }
        return next
      })
    },
    [],
  )

  // ── Save handler ────────────────────────────────────────────────

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatus({ type, text })
    if (statusTimer.current) clearTimeout(statusTimer.current)
    if (type === 'success') {
      statusTimer.current = setTimeout(() => setStatus(null), 3000)
    }
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    setStatus(null)
    try {
      const resp = await api.saveConfig({ updates: dirtyFields })
      showStatus('success', resp.message)
      // Reload config to get fresh data
      const fullCfg = await api.fullConfig()
      setConfig(fullCfg.config)
      setDirtyFields({})
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      showStatus('error', msg)
    } finally {
      setSaving(false)
    }
  }, [dirtyFields])

  // ── Derived state ───────────────────────────────────────────────

  const dirtyCount = Object.keys(dirtyFields).length
  const hasDirty = dirtyCount > 0

  // Determine which groups have dirty fields
  const dirtyGroups = new Set<string>()
  for (const key of Object.keys(dirtyFields)) {
    const meta = fieldMeta[key]
    if (meta) dirtyGroups.add(meta.group)
  }

  // ── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
          <Settings className="h-5 w-5 text-indigo-400" />
          设置
        </h1>
        <div className="card p-8 text-center text-slate-400 text-sm">加载中...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
          <Settings className="h-5 w-5 text-indigo-400" />
          设置
        </h1>
        <div className="error-banner flex items-center justify-between">
          <span>加载失败: {loadError}</span>
          <button onClick={loadData} className="btn-secondary text-xs px-3 py-1">
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
        <Settings className="h-5 w-5 text-indigo-400" />
        设置
      </h1>

      {/* Top bar: config path + action buttons */}
      <div className="card p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="text-xs text-slate-500 font-mono truncate" title={configPath}>
            {configPath || '未加载配置文件'}
          </span>
          {configPath && (
            <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
              YAML
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirtyCount > 0 && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
              {dirtyCount} 项未保存修改
            </span>
          )}
          <button onClick={loadData} className="btn-ghost text-xs px-3 py-1.5" title="重新加载">
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
          <button
            onClick={handleSave}
            disabled={!hasDirty || saving}
            className={`btn text-xs px-4 py-1.5 ${hasDirty && !saving ? 'btn-primary' : 'btn-secondary opacity-50'}`}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* Status banner */}
      {status && (
        <div className={status.type === 'success' ? 'success-banner' : 'error-banner'}>
          {status.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          )}
          {status.text}
        </div>
      )}

      {/* Tab bar */}
      <div className="card overflow-hidden">
        <div className="flex overflow-x-auto gap-1 p-2 bg-slate-900/40 border-b border-slate-700/50 scrollbar-thin">
          {groups.map((g) => {
            const isActive = g.key === activeGroup
            const isDirty = dirtyGroups.has(g.key)
            return (
              <button
                key={g.key}
                onClick={() => setActiveGroup(g.key)}
                className={`tab-btn ${isActive ? 'tab-btn-active' : 'tab-btn-inactive'} ${isDirty ? 'tab-btn-dirty' : ''}`}
              >
                {g.label}
              </button>
            )
          })}
        </div>

        {/* Form area */}
        <div className="p-5">
          {config && (
            <ConfigForm
              group={activeGroup}
              config={config}
              fieldMeta={fieldMeta}
              dirtyFields={dirtyFields}
              onFieldChange={handleFieldChange}
            />
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-slate-600 text-center">
        注意: 保存配置将覆盖写入 YAML 文件（原有注释会丢失）。服务器/端口等配置修改后需重启服务生效。
      </p>
    </div>
  )
}
