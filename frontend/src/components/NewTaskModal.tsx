import { useState, useEffect, useCallback } from 'react'
import { X, Rocket, Settings, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { api } from '@/api/client'

interface Props {
  open: boolean
  onClose: () => void
  onStart: (topic: string, autoApprove: boolean, configOverrides?: Record<string, unknown>) => void
  loading: boolean
}

type Mode = 'quick' | 'advanced'

interface FormState {
  topic: string
  autoApprove: boolean
  experimentMode: string
  timeBudgetSec: number
  maxIterations: number
  metricDirection: string
  metricKey: string
  exportConference: string
  authors: string
  enableRepair: boolean
  enableFigureAgent: boolean
  enableBenchmarkAgent: boolean
}

const DEFAULT_FORM: FormState = {
  topic: '',
  autoApprove: true,
  experimentMode: 'simulated',
  timeBudgetSec: 300,
  maxIterations: 10,
  metricDirection: 'minimize',
  metricKey: 'primary_metric',
  exportConference: 'neurips_2025',
  authors: 'Anonymous',
  enableRepair: true,
  enableFigureAgent: true,
  enableBenchmarkAgent: true,
}

const EXPERIMENT_MODES = [
  { value: 'simulated', label: '模拟模式' },
  { value: 'sandbox', label: '沙箱模式' },
  { value: 'docker', label: 'Docker模式' },
  { value: 'agentic', label: 'Agentic模式' },
  { value: 'ssh_remote', label: 'SSH远程' },
]

const CONFERENCES = [
  { value: 'neurips_2025', label: 'NeurIPS 2025' },
  { value: 'icml_2025', label: 'ICML 2025' },
  { value: 'iclr_2025', label: 'ICLR 2025' },
  { value: 'cvpr_2025', label: 'CVPR 2025' },
  { value: 'aaai_2025', label: 'AAAI 2025' },
  { value: 'ijcai_2025', label: 'IJCAI 2025' },
  { value: 'acl_2025', label: 'ACL 2025' },
]

export default function NewTaskModal({ open, onClose, onStart, loading }: Props) {
  const [mode, setMode] = useState<Mode>('quick')
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [showAllOptions, setShowAllOptions] = useState(false)
  useEffect(() => {
    if (open) {
      api.fullConfig().then((res) => {
        const cfg = res.config
        const research = (cfg?.research as Record<string, unknown>) || {}
        const exp = (cfg?.experiment as Record<string, unknown>) || {}
        const export_ = (cfg?.export as Record<string, unknown>) || {}
        const repair = (exp?.repair as Record<string, unknown>) || {}
        const figureAgent = (exp?.figure_agent as Record<string, unknown>) || {}
        const benchmarkAgent = (exp?.benchmark_agent as Record<string, unknown>) || {}
        setForm({
          topic: (research?.topic as string) || '',
          autoApprove: true,
          experimentMode: (exp?.mode as string) || 'simulated',
          timeBudgetSec: (exp?.time_budget_sec as number) || 300,
          maxIterations: (exp?.max_iterations as number) || 10,
          metricDirection: (exp?.metric_direction as string) || 'minimize',
          metricKey: (exp?.metric_key as string) || 'primary_metric',
          exportConference: (export_?.target_conference as string) || 'neurips_2025',
          authors: (export_?.authors as string) || 'Anonymous',
          enableRepair: (repair?.enabled as boolean) ?? true,
          enableFigureAgent: (figureAgent?.enabled as boolean) ?? true,
          enableBenchmarkAgent: (benchmarkAgent?.enabled as boolean) ?? true,
        })
      }).catch(() => {
        setForm(DEFAULT_FORM)
      })
    }
  }, [open])

  const updateForm = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleStart = () => {
    if (!form.topic.trim()) return

    let overrides: Record<string, unknown> | undefined
    if (mode === 'advanced') {
      overrides = {
        experiment: {
          mode: form.experimentMode,
          time_budget_sec: form.timeBudgetSec,
          max_iterations: form.maxIterations,
          metric_direction: form.metricDirection,
          metric_key: form.metricKey,
          repair: { enabled: form.enableRepair },
          figure_agent: { enabled: form.enableFigureAgent },
          benchmark_agent: { enabled: form.enableBenchmarkAgent },
        },
        export: {
          target_conference: form.exportConference,
          authors: form.authors,
        },
      }
    }

    onStart(form.topic, form.autoApprove, overrides)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-slate-100">新建研究任务</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switch */}
        <div className="px-6 pt-4">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-1">
            <button
              onClick={() => setMode('quick')}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                mode === 'quick'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Rocket className="h-3.5 w-3.5" /> 快速开始
            </button>
            <button
              onClick={() => setMode('advanced')}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                mode === 'advanced'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Settings className="h-3.5 w-3.5" /> 高级配置
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4 px-6 py-5">
          {/* Topic - always required */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">研究主题 <span className="text-rose-400">*</span></label>
            <textarea
              value={form.topic}
              onChange={(e) => updateForm('topic', e.target.value)}
              placeholder="输入你的研究主题，例如：基于Transformer的图像分类新算法..."
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none resize-none"
              rows={3}
            />
          </div>

          {/* Auto-approve */}
          <div className="flex items-center gap-3">
            <input
              id="auto-approve"
              type="checkbox"
              checked={form.autoApprove}
              onChange={(e) => updateForm('autoApprove', e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
            />
            <label htmlFor="auto-approve" className="text-sm text-slate-300">
              自动批准关卡（全程无人值守模式）
            </label>
          </div>

          {mode === 'advanced' && (
            <>
              <div className="border-t border-slate-800 pt-4">
                <button
                  onClick={() => setShowAllOptions(!showAllOptions)}
                  className="flex items-center gap-1 text-sm font-medium text-indigo-400 hover:text-indigo-300"
                >
                  {showAllOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showAllOptions ? '收起更多选项' : '展开更多选项'}
                </button>
              </div>

              {showAllOptions && (
                <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-800/40 p-4">
                  {/* Experiment Mode */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">实验执行模式</label>
                    <select
                      value={form.experimentMode}
                      onChange={(e) => updateForm('experimentMode', e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                    >
                      {EXPERIMENT_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">时间预算 (秒)</label>
                      <input
                        type="number"
                        value={form.timeBudgetSec}
                        onChange={(e) => updateForm('timeBudgetSec', Number(e.target.value))}
                        min={60}
                        step={60}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">最大迭代次数</label>
                      <input
                        type="number"
                        value={form.maxIterations}
                        onChange={(e) => updateForm('maxIterations', Number(e.target.value))}
                        min={1}
                        max={100}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">指标方向</label>
                      <select
                        value={form.metricDirection}
                        onChange={(e) => updateForm('metricDirection', e.target.value)}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="minimize">最小化</option>
                        <option value="maximize">最大化</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">指标名称</label>
                      <input
                        type="text"
                        value={form.metricKey}
                        onChange={(e) => updateForm('metricKey', e.target.value)}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">目标会议</label>
                    <select
                      value={form.exportConference}
                      onChange={(e) => updateForm('exportConference', e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                    >
                      {CONFERENCES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">作者名称</label>
                    <input
                      type="text"
                      value={form.authors}
                      onChange={(e) => updateForm('authors', e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Agent 配置</label>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.enableRepair}
                          onChange={(e) => updateForm('enableRepair', e.target.checked)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500"
                        />
                        实验修复
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.enableFigureAgent}
                          onChange={(e) => updateForm('enableFigureAgent', e.target.checked)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500"
                        />
                        图表生成Agent
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.enableBenchmarkAgent}
                          onChange={(e) => updateForm('enableBenchmarkAgent', e.target.checked)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500"
                        />
                        基准测试Agent
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {!showAllOptions && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">实验执行模式</label>
                    <select
                      value={form.experimentMode}
                      onChange={(e) => updateForm('experimentMode', e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                    >
                      {EXPERIMENT_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">目标会议</label>
                    <select
                      value={form.exportConference}
                      onChange={(e) => updateForm('exportConference', e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                    >
                      {CONFERENCES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
            取消
          </button>
          <button
            onClick={handleStart}
            disabled={loading || !form.topic.trim()}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                启动中...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" /> 开始研究
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
