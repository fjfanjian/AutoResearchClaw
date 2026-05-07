// ─── Stage & Pipeline ────────────────────────────────────────────────────────

export type StageStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'blocked_approval'
  | 'approved'
  | 'rejected'
  | 'paused'
  | 'retrying'

export interface StageDef {
  number: number
  name: string
  label: string
  phase: string
}

export interface StageState {
  number: number
  name: string
  label: string
  phase: string
  status: StageStatus
  started_at?: string
  completed_at?: string
  duration_sec?: number
  artifacts?: string[]
  error?: string
  prm_score?: number
}

export const GATE_STAGES = new Set([5, 9, 20])

export const PHASE_INFO: Record<string, { label: string; color: string }> = {
  A: { label: 'Research Scoping', color: '#58a6ff' },
  B: { label: 'Literature Discovery', color: '#3fb950' },
  C: { label: 'Knowledge Synthesis', color: '#a371f7' },
  D: { label: 'Experiment Design', color: '#d29922' },
  E: { label: 'Experiment Execution', color: '#f0883e' },
  F: { label: 'Analysis & Decision', color: '#f85149' },
  G: { label: 'Paper Writing', color: '#79c0ff' },
  H: { label: 'Finalization', color: '#56d364' },
}

// Stage → phase mapping
export const STAGE_PHASE: Record<number, string> = {
  1: 'A', 2: 'A',
  3: 'B', 4: 'B', 5: 'B', 6: 'B',
  7: 'C', 8: 'C',
  9: 'D', 10: 'D', 11: 'D',
  12: 'E', 13: 'E',
  14: 'F', 15: 'F',
  16: 'G', 17: 'G', 18: 'G', 19: 'G',
  20: 'H', 21: 'H', 22: 'H', 23: 'H',
}

// ─── Run ──────────────────────────────────────────────────────────────────────

export interface Run {
  run_id: string
  path: string
  status?: string
  topic?: string
  checkpoint?: {
    stage?: number
    status?: string
    [key: string]: unknown
  }
  stages_completed?: string[]
}

export interface PipelineStatus {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped'
  run_id?: string
  topic?: string
  output_dir?: string
  stages_done?: number
  stages_failed?: number
  error?: string
}

// ─── Artifacts ────────────────────────────────────────────────────────────────

export interface ArtifactNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  extension?: string
  children?: ArtifactNode[]
}

// ─── HITL ────────────────────────────────────────────────────────────────────

export type PauseReason =
  | 'pre_stage'
  | 'post_stage'
  | 'gate_approval'
  | 'quality_below_threshold'
  | 'cost_budget_exceeded'
  | 'error_occurred'
  | 'human_requested'
  | 'confidence_low'

export interface WaitingState {
  stage: number
  stage_name: string
  reason: PauseReason
  since: string
  available_actions: string[]
  context_summary: string
  output_files: string[]
}

export interface HITLState {
  run_id: string
  waiting: WaitingState | null
  session: Record<string, unknown> | null
}

// ─── WebSocket events ─────────────────────────────────────────────────────────

export type EventType =
  | 'connected'
  | 'heartbeat'
  | 'error'
  | 'pipeline_started'
  | 'pipeline_completed'
  | 'stage_start'
  | 'stage_complete'
  | 'stage_fail'
  | 'metric_update'
  | 'log_line'
  | 'paper_ready'
  | 'chat_response'
  | 'chat_typing'
  | 'run_discovered'
  | 'run_status_changed'
  // HITL ws_adapter events
  | 'status_update'
  | 'stage_output'
  | 'notification'

export interface WSEvent {
  type: EventType
  data: Record<string, unknown>
  timestamp: number
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  title: string
  detail?: string
  level: NotificationLevel
  timestamp: number
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface MetricPoint {
  step: number
  value: number
  label?: string
}

export interface MetricSeries {
  name: string
  points: MetricPoint[]
  unit?: string
}
