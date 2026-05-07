/**
 * REST API client — thin wrappers around native fetch.
 * All functions throw on non-OK responses (message from JSON body when available).
 */

import type {
  ArtifactNode,
  HITLState,
  PipelineStatus,
  Run,
  StageDef,
} from '../types'

const BASE = ''

async function _fetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${input}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) msg = body.detail
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

// ─── Health & config ──────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<{ status: string; version: string }> {
  return _fetch('/api/health')
}

export async function fetchConfig(): Promise<Record<string, unknown>> {
  return _fetch('/api/config')
}

// ─── Pipeline control ─────────────────────────────────────────────────────────

export async function startPipeline(
  topic: string,
  autoApprove = true,
): Promise<{ run_id: string; status: string; output_dir: string }> {
  return _fetch('/api/pipeline/start', {
    method: 'POST',
    body: JSON.stringify({ topic, auto_approve: autoApprove }),
  })
}

export async function stopPipeline(): Promise<{ status: string }> {
  return _fetch('/api/pipeline/stop', { method: 'POST' })
}

export async function fetchPipelineStatus(): Promise<PipelineStatus> {
  return _fetch('/api/pipeline/status')
}

export async function fetchPipelineStages(): Promise<{ stages: StageDef[] }> {
  return _fetch('/api/pipeline/stages')
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export async function fetchRuns(): Promise<{ runs: Run[] }> {
  return _fetch('/api/runs')
}

export async function fetchRun(runId: string): Promise<Run> {
  return _fetch(`/api/runs/${runId}`)
}

export async function fetchRunMetrics(
  runId: string,
): Promise<{ run_id: string; metrics: Record<string, unknown> }> {
  return _fetch(`/api/runs/${runId}/metrics`)
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export async function fetchArtifacts(
  runId: string,
): Promise<{ run_id: string; tree: ArtifactNode }> {
  return _fetch(`/api/runs/${runId}/artifacts`)
}

export async function fetchArtifactContent(
  runId: string,
  filePath: string,
): Promise<{ path: string; content: string; size: number; mime: string }> {
  return _fetch(`/api/runs/${runId}/artifacts/${filePath}`)
}

// ─── HITL ────────────────────────────────────────────────────────────────────

export async function fetchHITLState(runId: string): Promise<HITLState> {
  return _fetch(`/api/runs/${runId}/hitl`)
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export async function fetchLogs(runId: string, tail = 200): Promise<string> {
  const res = await fetch(`/api/runs/${runId}/logs?tail=${tail}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.text()
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<{
  projects: Array<{ id: string; path: string; status?: string; current_stage?: number }>
}> {
  return _fetch('/api/projects')
}
