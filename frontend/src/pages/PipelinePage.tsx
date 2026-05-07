import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { PipelineTimeline } from '../components/PipelineTimeline'
import { StageDetail } from '../components/StageDetail'
import { HITLPanel } from '../components/HITLPanel'
import { CostTracker } from '../components/CostTracker'
import { useHITL } from '../hooks/useHITL'

export function PipelinePage() {
  const { state } = useApp()
  const { pipeline, stages, activeRunId } = state
  const [selectedStage, setSelectedStage] = useState<number | null>(null)

  const {
    hitlState,
    chatMessages,
    approve,
    reject,
    injectGuidance,
    sendChat,
  } = useHITL(activeRunId)

  const waiting = hitlState?.waiting ?? null
  const selectedStageData = stages.find((s) => s.number === selectedStage)

  const isRunning = pipeline.status === 'running'
  const stageDone = stages.filter((s) => s.status === 'done').length

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Timeline */}
      <div className="w-72 shrink-0 border-r border-surface-border overflow-auto">
        {/* Run summary */}
        <div className="px-4 py-3 border-b border-surface-border bg-surface-raised">
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                isRunning
                  ? 'bg-success/20 text-success'
                  : pipeline.status === 'completed'
                  ? 'bg-accent/20 text-accent'
                  : pipeline.status === 'failed'
                  ? 'bg-danger/20 text-danger'
                  : 'bg-surface-border text-muted'
              }`}
            >
              {pipeline.status}
            </span>
            <span className="text-xs text-muted">{stageDone}/23</span>
          </div>
          {pipeline.topic && (
            <p className="text-xs text-muted mt-1 truncate" title={pipeline.topic}>
              {pipeline.topic}
            </p>
          )}
        </div>

        <PipelineTimeline
          stages={stages}
          activeStage={selectedStage}
          onSelect={setSelectedStage}
        />
      </div>

      {/* Right: Details + HITL */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* HITL panel — shown only when paused */}
        {waiting && (
          <HITLPanel
            waiting={waiting}
            approve={approve}
            reject={reject}
            injectGuidance={injectGuidance}
            sendChat={sendChat}
            chatMessages={chatMessages}
          />
        )}

        {/* Stage detail */}
        {selectedStageData ? (
          <StageDetail
            stage={selectedStageData}
            runId={activeRunId}
          />
        ) : (
          <div className="flex items-center justify-center h-48 text-muted text-sm">
            {stages.length === 0
              ? 'Start a pipeline to see stages'
              : 'Click a stage to see details'}
          </div>
        )}

        {/* Cost tracker (if we have cost data) */}
        {pipeline.status !== 'idle' && (
          <CostTracker totalCost={0} />
        )}
      </div>
    </div>
  )
}
