import type { ConfigSummary, Run, RunSummary, StageDef, ArtifactNode, ArtifactContent, HITLStatus, DoctorReport, FullConfigResponse, ConfigSaveRequest, ConfigSaveResponse, ConfigFieldsResponse } from '@/types'

const API_BASE = '/api'

async function _fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  doctor: () => _fetch<DoctorReport>('/doctor'),

  health: () => _fetch<{ status: string; version: string; active_connections: number }>('/health'),

  config: () => _fetch<ConfigSummary>('/config'),

  fullConfig: () => _fetch<FullConfigResponse>('/config/full'),

  saveConfig: (updates: ConfigSaveRequest) =>
    _fetch<ConfigSaveResponse>('/config/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }),

  configFields: () => _fetch<ConfigFieldsResponse>('/config/fields'),

  pipelineStages: () => _fetch<{ stages: StageDef[] }>('/pipeline/stages'),

  pipelineStatus: () => _fetch<{ status: string } & Record<string, unknown>>('/pipeline/status'),

  startPipeline: (topic: string, autoApprove = true, configOverrides?: Record<string, unknown>) =>
    _fetch<{ run_id: string; status: string; output_dir: string }>('/pipeline/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, auto_approve: autoApprove, config_overrides: configOverrides }),
    }),

  stopPipeline: () =>
    _fetch<{ status: string }>('/pipeline/stop', { method: 'POST' }),

  resumePipeline: (runId: string, autoApprove = true, configOverrides?: Record<string, unknown>) =>
    _fetch<{ run_id: string; status: string; output_dir: string }>(`/pipeline/resume/${runId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_approve: autoApprove, config_overrides: configOverrides }),
    }),

  listRuns: () => _fetch<{ runs: RunSummary[] }>('/runs'),

  getRun: (runId: string) => _fetch<Run & Record<string, unknown>>(`/runs/${runId}`),

  getRunMetrics: (runId: string) => _fetch<{ run_id: string; metrics: Record<string, unknown> }>(`/runs/${runId}/metrics`),

  listArtifacts: (runId: string) => _fetch<{ run_id: string; tree: ArtifactNode }>(`/runs/${runId}/artifacts`),

  getArtifact: (runId: string, path: string) => _fetch<ArtifactContent>(`/runs/${runId}/artifacts/${path}`),

  getLogs: (runId: string, tail = 200) =>
    _fetch<{ run_id: string; lines: string[]; total_lines: number; tail: number }>(`/runs/${runId}/logs?tail=${tail}`),

  getHITL: (runId: string) => _fetch<HITLStatus>(`/runs/${runId}/hitl`),
}
