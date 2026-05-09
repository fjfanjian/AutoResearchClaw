// ── Pipeline ──────────────────────────────────────────────────

export interface StageDef {
  number: number;
  name: string;
  label: string;
  phase: string;
}

export type StageStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'blocked'
  | 'paused'
  | 'approved'
  | 'rejected';

export interface StageInfo {
  number: number;
  name: string;
  label: string;
  phase: string;
  status: StageStatus;
  durationSec?: number;
  artifactCount?: number;
  prmScore?: number;
  error?: string;
}

// ── Run ───────────────────────────────────────────────────────

export interface RunSummary {
  run_id: string;
  path: string;
  topic?: string;
  status?: string;
  current_stage?: number;
  stages_completed?: string[];
}

export interface Run {
  run_id: string;
  path: string;
  status: string;
  current_stage: number;
  current_stage_name: string;
  total_stages: number;
  start_time: string;
  elapsed_sec: number;
  is_active: boolean;
  topic: string;
  metrics: Record<string, unknown>;
  stages_completed: string[];
  error: string;
}

export interface ActiveRunState {
  run_id: string;
  status: string;
  output_dir: string;
  topic: string;
  current_stage: number;
  current_stage_name: string;
  total_stages: number;
  stages_done?: number;
  stages_failed?: number;
  elapsed_sec?: number;
  start_time?: string;
  is_active?: boolean;
  error?: string;
}

// ── Artifact ──────────────────────────────────────────────────

export interface ArtifactNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: ArtifactNode[];
  size?: number;
  mtime?: string;
}

export interface ArtifactContent {
  content: string;
  mime_type: string;
  path: string;
  encoding?: string;
}

// ── HITL ──────────────────────────────────────────────────────

export type PauseReason =
  | 'PRE_STAGE'
  | 'POST_STAGE'
  | 'GATE_APPROVAL'
  | 'QUALITY_BELOW_THRESHOLD'
  | 'COST_BUDGET_EXCEEDED'
  | 'ERROR_OCCURRED'
  | 'HUMAN_REQUESTED'
  | 'CONFIDENCE_LOW';

export interface HITLWaitingState {
  stage: number;
  stage_name: string;
  pause_reason: PauseReason;
  summary: string;
  available_actions: string[];
  context?: Record<string, unknown>;
}

export interface HITLSessionState {
  state: string;
  run_id: string;
  mode: string;
  current_stage: number;
  pause_history: unknown[];
}

export interface HITLStatus {
  session: HITLSessionState | null;
  waiting: HITLWaitingState | null;
}

export type InboundHITLMessage =
  | { type: 'get_status' }
  | { type: 'approve'; message?: string }
  | { type: 'reject'; reason?: string }
  | { type: 'edit'; files: Record<string, string> }
  | { type: 'inject_guidance'; stage: number; guidance: string }
  | { type: 'chat_message'; content: string };

export type OutboundHITLMessage =
  | { type: 'status_update'; session: HITLSessionState | null; waiting: HITLWaitingState | null }
  | { type: 'stage_output'; stage: number; files: unknown[] }
  | { type: 'chat_response'; content: string }
  | { type: 'notification'; title: string; level: 'info' | 'success' | 'warning' | 'error'; detail?: string };

// ── WebSocket Events ──────────────────────────────────────────

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
  | 'chat_suggestion'
  | 'run_discovered'
  | 'run_status_changed';

export interface EventMessage {
  type: EventType;
  data: Record<string, unknown>;
  timestamp: number;
}

// ── Doctor ────────────────────────────────────────────────────

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  fix: string;
}

export interface DoctorReport {
  timestamp: string;
  overall: 'pass' | 'fail';
  checks: DoctorCheck[];
  actionable_fixes: string[];
}

// ── Config ────────────────────────────────────────────────────

export interface ConfigSummary {
  project: string;
  topic: string;
  mode: string;
  server: {
    voice_enabled: boolean;
    dashboard_enabled: boolean;
  };
}

// ── Full Config (for settings page) ──────────────────────────

export type FieldType = 'string' | 'int' | 'float' | 'boolean' | 'select' | 'password' | 'taglist' | 'text';

export interface FieldMeta {
  group: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  sensitive?: boolean;
  placeholder?: string;
  default?: unknown;
}

export interface ConfigGroup {
  key: string;
  label: string;
  icon: string;
}

export interface ConfigFieldsResponse {
  groups: ConfigGroup[];
  fields: Record<string, FieldMeta>;
}

export interface FullConfigResponse {
  config_path: string;
  config: Record<string, unknown>;
}

export interface ConfigSaveRequest {
  updates: Record<string, unknown>;
}

export interface ConfigSaveResponse {
  success: boolean;
  message: string;
  config_path: string;
}

// ── Notification ──────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  title: string;
  level: 'info' | 'success' | 'warning' | 'error';
  detail?: string;
  timestamp: number;
}
