import { useState } from 'react'
import { Check, X, MessageSquare, Send, Edit3, Lightbulb } from 'lucide-react'
import type { HITLWaitingState } from '@/types'
import { useHITL } from '@/hooks/useHITL'

interface Props {
  runId: string
  waiting: HITLWaitingState | null
}

export default function HITLPanel({ runId, waiting }: Props) {
  const { isConnected, chatMessages, approve, reject, edit, injectGuidance, sendChat } = useHITL(runId)
  const [rejectReason, setRejectReason] = useState('')
  const [guidance, setGuidance] = useState('')
  const [guidanceStage, setGuidanceStage] = useState(waiting?.stage || 1)
  const [editFiles, setEditFiles] = useState<Record<string, string>>({})
  const [chatInput, setChatInput] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showGuidance, setShowGuidance] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showChat, setShowChat] = useState(false)

  if (!waiting) {
    return (
      <div className="card p-4 text-sm text-slate-500">
        <p>流水线运行中，无需人机干预。</p>
        {!isConnected && <p className="mt-1 text-rose-400">WebSocket 已断开</p>}
      </div>
    )
  }

  const available = waiting.available_actions || []

  return (
    <div className="card border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-amber-300">
            需要人机干预
          </h4>
          <p className="mt-0.5 text-xs text-slate-400">
            阶段 {waiting.stage}: {waiting.stage_name} — {waiting.pause_reason}
          </p>
        </div>
        <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      </div>

      {waiting.summary && (
        <div className="rounded-md bg-slate-800/60 p-3 text-sm text-slate-300">
          {waiting.summary}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {available.includes('APPROVE') && (
          <button onClick={() => approve()} className="btn-success">
            <Check className="h-4 w-4" /> 批准
          </button>
        )}
        {available.includes('REJECT') && (
          <button onClick={() => setShowReject(!showReject)} className="btn-danger">
            <X className="h-4 w-4" /> 拒绝
          </button>
        )}
        {available.includes('EDIT') && (
          <button onClick={() => setShowEdit(!showEdit)} className="btn-secondary">
            <Edit3 className="h-4 w-4" /> 编辑
          </button>
        )}
        {available.includes('INJECT') && (
          <button onClick={() => setShowGuidance(!showGuidance)} className="btn-secondary">
            <Lightbulb className="h-4 w-4" /> 注入指导
          </button>
        )}
        {available.includes('COLLABORATE') && (
          <button onClick={() => setShowChat(!showChat)} className="btn-secondary">
            <MessageSquare className="h-4 w-4" /> 聊天
          </button>
        )}
      </div>

      {showReject && (
        <div className="space-y-2">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="拒绝原因..."
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-rose-500 focus:outline-none"
            rows={2}
          />
          <button onClick={() => { reject(rejectReason); setShowReject(false); }} className="btn-danger">
            确认拒绝
          </button>
        </div>
      )}

      {showGuidance && (
        <div className="space-y-2">
          <input
            type="number"
            value={guidanceStage}
            onChange={(e) => setGuidanceStage(Number(e.target.value))}
            min={1} max={23}
            className="w-20 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          />
          <textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="输入指导内容（Markdown）..."
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            rows={4}
          />
          <button
            onClick={() => { injectGuidance(guidanceStage, guidance); setShowGuidance(false); setGuidance(''); }}
            className="btn-primary"
          >
            注入指导
          </button>
        </div>
      )}

      {showEdit && (
        <div className="space-y-2">
          {Object.entries(editFiles).map(([name, content]) => (
            <div key={name} className="space-y-1">
              <label className="text-xs text-slate-400">{name}</label>
              <textarea
                value={content}
                onChange={(e) => setEditFiles((prev) => ({ ...prev, [name]: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none"
                rows={6}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const name = prompt('文件名：')
                if (name) setEditFiles((prev) => ({ ...prev, [name]: '' }))
              }}
              className="btn-secondary text-xs"
            >
              添加文件
            </button>
            <button
              onClick={() => { edit(editFiles); setShowEdit(false); setEditFiles({}); }}
              className="btn-primary text-xs"
            >
              提交编辑
            </button>
          </div>
        </div>
      )}

      {showChat && (
        <div className="space-y-2">
          <div className="max-h-60 overflow-y-auto rounded-md border border-slate-700 bg-slate-800/50 p-3 space-y-2">
            {chatMessages.length === 0 && (
              <p className="text-xs text-slate-500">开始协作对话...</p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.role === 'human' ? 'text-indigo-300' : 'text-slate-300'}`}>
                <span className="text-xs font-semibold uppercase text-slate-500">{msg.role === 'human' ? '用户' : 'AI'}</span>
                <p className="mt-0.5 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { sendChat(chatInput); setChatInput(''); } }}
              placeholder="输入消息..."
              className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
            <button onClick={() => { sendChat(chatInput); setChatInput(''); }} className="btn-primary px-3">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
