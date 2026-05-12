"""Pipeline control API routes."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

import re as _re
_RUN_ID_RE = _re.compile(r"^rc-\d{8}-\d{6}-[a-f0-9]+$")


def _validated_run_dir(run_id: str) -> Path:
    """Validate run_id format and return the run directory path."""
    if not _RUN_ID_RE.match(run_id):
        raise HTTPException(status_code=400, detail=f"Invalid run_id format: {run_id}")
    run_dir = Path("artifacts") / run_id
    # Ensure resolved path is under artifacts/
    if not run_dir.resolve().is_relative_to(Path("artifacts").resolve()):
        raise HTTPException(status_code=400, detail=f"Invalid run_id: {run_id}")
    return run_dir

router = APIRouter(prefix="/api", tags=["pipeline"])


class PipelineStartRequest(BaseModel):
    """Request body for starting a pipeline run."""

    topic: str | None = None
    config_overrides: dict[str, Any] | None = None
    auto_approve: bool = True


class PipelineStartResponse(BaseModel):
    """Response after starting a pipeline."""

    run_id: str
    status: str
    output_dir: str


# In-memory tracking of the active run (single-tenant MVP)
_active_run: dict[str, Any] | None = None
_run_task: asyncio.Task[Any] | None = None


def _get_app_state() -> dict[str, Any]:
    """Get shared application state (set by app.py)."""
    from researchclaw.server.app import _app_state
    return _app_state


def _deep_update(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    """Recursively update base dict with overrides."""
    for key, value in overrides.items():
        if isinstance(value, dict) and key in base and isinstance(base[key], dict):
            base[key] = _deep_update(base[key], value)
        else:
            base[key] = value
    return base


@router.post("/pipeline/start", response_model=PipelineStartResponse)
async def start_pipeline(req: PipelineStartRequest) -> PipelineStartResponse:
    """Start a new pipeline run."""
    global _active_run, _run_task

    if _active_run and _active_run.get("status") == "running":
        raise HTTPException(status_code=409, detail="A pipeline is already running")

    state = _get_app_state()
    config = state["config"]

    if req.topic:
        import dataclasses
        new_research = dataclasses.replace(config.research, topic=req.topic)
        config = dataclasses.replace(config, research=new_research)

    # Apply config overrides if provided
    if req.config_overrides:
        from researchclaw.config import RCConfig
        config_dict = config.to_dict()
        config_dict = _deep_update(config_dict, req.config_overrides)
        config = RCConfig.from_dict(config_dict, check_paths=False)

    import hashlib
    from datetime import datetime, timezone

    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    project_hash = hashlib.sha256(config.project.name.encode()).hexdigest()[:6]
    run_id = f"rc-{ts}-{project_hash}"
    run_dir = _validated_run_dir(run_id)
    run_dir.mkdir(parents=True, exist_ok=True)

    _active_run = {
        "run_id": run_id,
        "status": "running",
        "output_dir": str(run_dir),
        "topic": config.research.topic,
        "current_stage": 1,
        "current_stage_name": "",
        "total_stages": 23,
    }

    async def _run_in_background() -> None:
        global _active_run
        try:
            from researchclaw.adapters import AdapterBundle
            from researchclaw.pipeline.runner import execute_pipeline

            kb_root = Path(config.knowledge_base.root) if config.knowledge_base.root else None
            if kb_root:
                kb_root.mkdir(parents=True, exist_ok=True)

            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None,
                lambda: execute_pipeline(
                    run_dir=run_dir,
                    run_id=run_id,
                    config=config,
                    adapters=AdapterBundle(),
                    auto_approve_gates=req.auto_approve,
                    skip_noncritical=True,
                    kb_root=kb_root,
                ),
            )
            done = sum(1 for r in results if r.status.value == "done")
            failed = sum(1 for r in results if r.status.value == "failed")
            if _active_run:
                _active_run["status"] = "completed" if failed == 0 else "failed"
                _active_run["current_stage"] = 23
                _active_run["current_stage_name"] = "Completed"
                _active_run["stages_done"] = done
                _active_run["stages_failed"] = failed
        except Exception as exc:
            logger.exception("Pipeline run failed")
            if _active_run:
                _active_run["status"] = "failed"
                _active_run["error"] = str(exc)

    # Broadcast pipeline_started event
    try:
        state = _get_app_state()
        ev_mgr = state.get("event_manager")
        if ev_mgr:
            from researchclaw.server.websocket.events import Event, EventType
            asyncio.create_task(
                ev_mgr.broadcast(
                    Event(type=EventType.PIPELINE_STARTED, data=dict(_active_run))
                )
            )
    except Exception:
        logger.exception("Failed to broadcast pipeline_started event")

    _run_task = asyncio.create_task(_run_in_background())

    return PipelineStartResponse(
        run_id=run_id,
        status="running",
        output_dir=str(run_dir),
    )


class PipelineResumeRequest(BaseModel):
    """Request body for resuming a pipeline run."""

    auto_approve: bool = True
    config_overrides: dict[str, Any] | None = None


@router.post("/pipeline/resume/{run_id}", response_model=PipelineStartResponse)
async def resume_pipeline(run_id: str, req: PipelineResumeRequest) -> PipelineStartResponse:
    """Resume a pipeline run from its last checkpoint."""
    global _active_run, _run_task

    if _active_run and _active_run.get("status") == "running":
        raise HTTPException(status_code=409, detail="A pipeline is already running")

    run_dir = _validated_run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    # Read checkpoint to determine next stage
    from researchclaw.pipeline.runner import read_checkpoint

    next_stage = read_checkpoint(run_dir)
    if next_stage is None:
        raise HTTPException(status_code=400, detail="No valid checkpoint found – the run may already be complete or have no checkpoint")

    state = _get_app_state()
    config = state["config"]

    # Try to recover topic from checkpoint, fall back to config topic
    topic = config.research.topic
    try:
        ckpt_data = json.loads((run_dir / "checkpoint.json").read_text(encoding="utf-8"))
        topic = ckpt_data.get("topic", topic)
    except Exception:
        pass

    # Build config with the resolved topic
    import dataclasses

    new_research = dataclasses.replace(config.research, topic=topic)
    config = dataclasses.replace(config, research=new_research)

    if req.config_overrides:
        from researchclaw.config import RCConfig

        config_dict = config.to_dict()
        config_dict = _deep_update(config_dict, req.config_overrides)
        config = RCConfig.from_dict(config_dict, check_paths=False)

    _active_run = {
        "run_id": run_id,
        "status": "running",
        "output_dir": str(run_dir),
        "topic": topic,
        "current_stage": int(next_stage),
        "current_stage_name": next_stage.name,
        "total_stages": 23,
    }

    async def _run_in_background() -> None:
        global _active_run
        try:
            from researchclaw.adapters import AdapterBundle
            from researchclaw.pipeline.runner import execute_pipeline

            kb_root = Path(config.knowledge_base.root) if config.knowledge_base.root else None
            if kb_root:
                kb_root.mkdir(parents=True, exist_ok=True)

            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None,
                lambda: execute_pipeline(
                    run_dir=run_dir,
                    run_id=run_id,
                    config=config,
                    adapters=AdapterBundle(),
                    from_stage=next_stage,
                    auto_approve_gates=req.auto_approve,
                    skip_noncritical=True,
                    kb_root=kb_root,
                ),
            )
            done = sum(1 for r in results if r.status.value == "done")
            failed = sum(1 for r in results if r.status.value == "failed")
            if _active_run:
                _active_run["status"] = "completed" if failed == 0 else "failed"
                _active_run["current_stage"] = 23
                _active_run["current_stage_name"] = "Completed"
                _active_run["stages_done"] = done
                _active_run["stages_failed"] = failed
        except Exception as exc:
            logger.exception("Pipeline resume failed")
            if _active_run:
                _active_run["status"] = "failed"
                _active_run["error"] = str(exc)

    # Broadcast pipeline_started event
    try:
        ev_mgr = state.get("event_manager")
        if ev_mgr:
            from researchclaw.server.websocket.events import Event, EventType

            asyncio.create_task(
                ev_mgr.broadcast(
                    Event(type=EventType.PIPELINE_STARTED, data=dict(_active_run))
                )
            )
    except Exception:
        logger.exception("Failed to broadcast pipeline_started event")

    _run_task = asyncio.create_task(_run_in_background())

    return PipelineStartResponse(
        run_id=run_id,
        status="running",
        output_dir=str(run_dir),
    )


@router.post("/pipeline/stop")
async def stop_pipeline() -> dict[str, str]:
    """Stop the currently running pipeline."""
    global _active_run, _run_task

    if not _run_task or not _active_run:
        raise HTTPException(status_code=404, detail="No pipeline is running")

    _run_task.cancel()
    _active_run["status"] = "stopped"
    return {"status": "stopped"}


@router.get("/pipeline/status")
async def pipeline_status() -> dict[str, Any]:
    """Get current pipeline run status."""
    if not _active_run:
        return {"status": "idle"}
    result = dict(_active_run)
    # Enrich with checkpoint data if available
    if _active_run.get("run_id"):
        run_dir = Path("artifacts") / _active_run["run_id"]
        ckpt = run_dir / "checkpoint.json"
        if ckpt.exists():
            try:
                with ckpt.open() as f:
                    ckpt_data = json.load(f)
                result["current_stage"] = ckpt_data.get("stage", 0)
                result["current_stage_name"] = ckpt_data.get("stage_name", "")
            except Exception:
                pass
    return result


@router.get("/doctor")
async def doctor_check() -> dict[str, Any]:
    """Run environment health checks (doctor) and return report."""
    import asyncio
    from researchclaw.health import run_doctor_from_config

    state = _get_app_state()
    config = state["config"]

    loop = asyncio.get_event_loop()
    report = await loop.run_in_executor(None, run_doctor_from_config, config)
    return report.to_dict()  # type: ignore[return-value]


@router.get("/pipeline/stages")
async def pipeline_stages() -> dict[str, Any]:
    """Get the 23-stage pipeline definition."""
    from researchclaw.pipeline.stages import Stage, PHASE_MAP

    # Build stage_number -> phase_letter mapping from PHASE_MAP
    _stage_phase: dict[int, str] = {}
    for phase_key, stage_tuple in PHASE_MAP.items():
        letter = phase_key[0]
        for s in stage_tuple:
            _stage_phase[int(s)] = letter

    stages = []
    for s in Stage:
        stages.append({
            "number": int(s),
            "name": s.name,
            "label": getattr(s, "label", s.name.replace("_", " ").title()),
            "phase": _stage_phase.get(int(s), ""),
        })
    return {"stages": stages}


@router.get("/runs")
async def list_runs() -> dict[str, Any]:
    """List historical pipeline runs from artifacts/ directory."""
    artifacts = Path("artifacts")
    runs: list[dict[str, Any]] = []
    if artifacts.exists():
        for d in sorted(artifacts.iterdir(), reverse=True):
            if d.is_dir() and d.name.startswith("rc-"):
                info: dict[str, Any] = {"run_id": d.name, "path": str(d)}
                # Try reading checkpoint and flatten key fields
                ckpt = d / "checkpoint.json"
                if ckpt.exists():
                    try:
                        with ckpt.open() as f:
                            ckpt_data: dict[str, Any] = json.load(f)
                        info["checkpoint"] = ckpt_data
                        info["current_stage"] = ckpt_data.get("last_completed_stage", 0)
                        info["topic"] = ckpt_data.get("topic", "")
                    except Exception:
                        pass
                # Determine status from pipeline_summary.json
                summary_file = d / "pipeline_summary.json"
                if summary_file.exists():
                    try:
                        with summary_file.open() as f:
                            summary_data: dict[str, Any] = json.load(f)
                        raw_status = summary_data.get("final_status", "unknown")
                        info["status"] = "completed" if raw_status == "done" else raw_status
                    except Exception:
                        info["status"] = "unknown"
                elif ckpt.exists():
                    info["status"] = "interrupted"
                else:
                    info["status"] = "unknown"
                runs.append(info)
    return {"runs": runs[:50]}  # limit to 50 most recent


@router.get("/runs/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    """Get details for a specific run."""
    run_dir = _validated_run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    info: dict[str, Any] = {"run_id": run_id, "path": str(run_dir)}

    ckpt = run_dir / "checkpoint.json"
    if ckpt.exists():
        try:
            with ckpt.open() as f:
                ckpt_data: dict[str, Any] = json.load(f)
            info["checkpoint"] = ckpt_data
            info["current_stage"] = ckpt_data.get("last_completed_stage", 0)
            info["topic"] = ckpt_data.get("topic", "")
        except Exception:
            pass

    # Determine status from pipeline_summary.json
    summary_file = run_dir / "pipeline_summary.json"
    if summary_file.exists():
        try:
            with summary_file.open() as f:
                summary_data: dict[str, Any] = json.load(f)
            raw_status = summary_data.get("final_status", "unknown")
            info["status"] = "completed" if raw_status == "done" else raw_status
        except Exception:
            info["status"] = "unknown"
    elif ckpt.exists():
        info["status"] = "interrupted"
    else:
        info["status"] = "unknown"

    # List stage directories
    stage_dirs = sorted(
        [d.name for d in run_dir.iterdir() if d.is_dir() and d.name.startswith("stage-")]
    )
    info["stages_completed"] = stage_dirs

    # Check for paper
    for pattern in ["paper.md", "paper.tex", "paper.pdf"]:
        found = list(run_dir.rglob(pattern))
        if found:
            info[f"has_{pattern.split('.')[1]}"] = True

    return info


@router.get("/runs/{run_id}/metrics")
async def get_run_metrics(run_id: str) -> dict[str, Any]:
    """Get experiment metrics for a run."""
    run_dir = _validated_run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    metrics: dict[str, Any] = {}
    results_file = run_dir / "results.json"
    if results_file.exists():
        try:
            with results_file.open() as f:
                metrics = json.load(f)
        except Exception:
            pass

    return {"run_id": run_id, "metrics": metrics}
