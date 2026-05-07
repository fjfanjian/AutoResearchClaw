import { useState } from 'react'
import { CheckCircle, MessageSquare, Send, XCircle } from 'lucide-react'
import type { WaitingState } from '../types'

const REASON_LABELS: Record<string, string> = {
  pre_stage: 'Pre-Stage Review',
  post_stage: 'Post-Stage Review',
  gate_approval: '🔒 Gate Approval Required',
  quality_below_threshold: 'Quality Below Threshold',
  cost_budget_exceeded: '💰 Cost Budget Exceeded',
  error_occurred: '⚠️ Error Occurred',
  human_requested: 'Human Requested',
  confidence_low: 'Low Confidence',
}

interface Props {
  waiting: WaitingState
  approve: (message?: string) => void
  reject: (reason?: string) => void
  injectGuidance: (stage: number, guidance: string) => void
  sendChat: (content: string) => void
  chatMessages: Array<{ role: 'human' | 'assistant'; content: string }>
}

export function HITLPanel({ waiting, approve, reject, injectGuidance, sendChat, chatMessages }: Props) {
  const [tab, setTab] = useState<'actions' | 'chat'>('actions')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showInject, setShowInject] = useState(false)
  const [guidance, setGuidance] = useState('')
  const [chatInput, setChatInput] = useState('')

  function handleApprove() {
    approve()
  }

  function handleReject() {
    if (!rejectReason.trim()) return
    reject(rejectReason.trim())
    setShowReject(false)
    setRejectReason('')
  }

  function handleInject() {
    if (!guidance.trim()) return
    injectGuidance(waiting.stage, guidance.trim())
    setShowInject(false)
    setGuidance('')
  }

  function handleChat() {
    if (!chatInput.trim()) return
    sendChat(chatInput.trim())
    setChatInput('')
  }

  return (
    <div className="border border-warning/40 rounded-xl bg-surface-overlay overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-warning/10 border-b border-warning/30">
        <div>
          <p className="text-xs font-semibold text-warning">
            {REASON_LABELS[waiting.reason] ?? waiting.reason}
          </p>
          <p className="text-sm font-medium mt-0.5">
            Stage {waiting.stage}: {waiting.stage_name}
          </p>
        </div>
        <span className="text-xs text-muted">
          Since {new Date(waiting.since).toLocaleTimeString()}
        </span>
      </div>

      {/* Context summary */}
      {waiting.context_summary && (
        <div className="px-4 py-3 border-b border-surface-border">
          <p className="text-xs text-muted mb-1">Context</p>
          <p className="text-sm">{waiting.context_summary}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-surface-border">
        {(['actions', 'chat'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'text-accent border-b-2 border-accent'
                : 'text-muted hover:text-gray-100'
            }`}
          >
            {t === 'actions' ? 'Actions' : 'Chat'}
          </button>
        ))}
      </div>

      {tab === 'actions' && (
        <div className="p-4 space-y-3">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-success/20 text-success hover:bg-success/30 text-sm font-medium transition-colors"
            >
              <CheckCircle size={15} /> Approve
            </button>
            <button
              onClick={() => setShowReject((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger/20 text-danger hover:bg-danger/30 text-sm font-medium transition-colors"
            >
              <XCircle size={15} /> Reject
            </button>
            <button
              onClick={() => setShowInject((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 text-sm font-medium transition-colors"
            >
              <MessageSquare size={15} /> Inject Guidance
            </button>
          </div>

          {/* Reject form */}
          {showReject && (
            <div className="space-y-2 p-3 bg-surface rounded-lg border border-surface-border">
              <label className="text-xs text-muted">Rejection Reason</label>
              <textarea
                rows={3}
                className="w-full bg-surface-overlay border border-surface-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
                placeholder="Why are you rejecting this stage?"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowReject(false)}
                  className="text-xs text-muted hover:text-gray-100 px-3 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim()}
                  className="text-xs bg-danger/20 text-danger hover:bg-danger/30 px-3 py-1 rounded disabled:opacity-50"
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          )}

          {/* Inject guidance form */}
          {showInject && (
            <div className="space-y-2 p-3 bg-surface rounded-lg border border-surface-border">
              <label className="text-xs text-muted">
                Guidance for Stage {waiting.stage}
              </label>
              <textarea
                rows={4}
                className="w-full bg-surface-overlay border border-surface-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none font-mono"
                placeholder="Enter guidance or instructions for this stage..."
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowInject(false)}
                  className="text-xs text-muted hover:text-gray-100 px-3 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInject}
                  disabled={!guidance.trim()}
                  className="text-xs bg-accent/20 text-accent hover:bg-accent/30 px-3 py-1 rounded disabled:opacity-50"
                >
                  Inject
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'chat' && (
        <div className="flex flex-col" style={{ height: '300px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <p className="text-xs text-muted">
                Start a collaboration chat with the pipeline.
              </p>
            ) : (
              chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'human' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'human'
                        ? 'bg-accent/20 text-gray-100'
                        : 'bg-surface-overlay text-gray-100 border border-surface-border'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-surface-border">
            <input
              className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
              placeholder="Type a message…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleChat() }}
            />
            <button
              onClick={handleChat}
              disabled={!chatInput.trim()}
              className="p-2 rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50 transition-colors"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
