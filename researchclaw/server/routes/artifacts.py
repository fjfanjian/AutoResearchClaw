"""Artifact browsing, HITL status, and log reading API routes."""

from __future__ import annotations

import json
import logging
import mimetypes
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, PlainTextResponse

import re as _re

_RUN_ID_RE = _re.compile(r"^rc-\d{8}-\d{6}-[a-f0-9]+$")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["artifacts"])

_ARTIFACTS_ROOT = Path("artifacts")

# File size cap for inline content responses (2 MB)
_MAX_INLINE_BYTES = 2 * 1024 * 1024


def _validated_run_dir(run_id: str) -> Path:
    """Validate run_id format and return the run directory path."""
    if not _RUN_ID_RE.match(run_id):
        raise HTTPException(status_code=400, detail=f"Invalid run_id format: {run_id}")
    run_dir = _ARTIFACTS_ROOT / run_id
    resolved = run_dir.resolve()
    try:
        resolved.relative_to(_ARTIFACTS_ROOT.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid run_id: {run_id}")
    return run_dir


def _build_tree(base: Path, current: Path) -> dict[str, Any]:
    """Recursively build a file-tree node for *current* relative to *base*."""
    rel = current.relative_to(base)
    node: dict[str, Any] = {
        "name": current.name,
        "path": str(rel).replace("\\", "/"),
        "type": "directory" if current.is_dir() else "file",
    }
    if current.is_dir():
        children: list[dict[str, Any]] = []
        try:
            for child in sorted(current.iterdir()):
                children.append(_build_tree(base, child))
        except PermissionError:
            pass
        node["children"] = children
    else:
        node["size"] = current.stat().st_size
        suffix = current.suffix.lower()
        node["extension"] = suffix.lstrip(".")
    return node


@router.get("/runs/{run_id}/artifacts")
async def list_artifacts(run_id: str) -> dict[str, Any]:
    """Recursively list all artifact files for a run (tree structure)."""
    run_dir = _validated_run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    tree = _build_tree(run_dir, run_dir)
    return {"run_id": run_id, "tree": tree}


@router.get("/runs/{run_id}/artifacts/{file_path:path}")
async def get_artifact(run_id: str, file_path: str) -> Any:
    """Read the content of a specific artifact file.

    Returns inline text content for text-like files, or a binary
    FileResponse for images/PDFs.  Large files above the size cap
    return a 413 error.
    """
    run_dir = _validated_run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    # Normalise and security-check the requested path
    try:
        target = (run_dir / file_path).resolve()
        target.relative_to(run_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Path traversal not allowed")

    if not target.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    if target.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")

    size = target.stat().st_size
    if size > _MAX_INLINE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size} bytes) — download directly",
        )

    mime, _ = mimetypes.guess_type(str(target))

    # Binary media → FileResponse
    if mime and (mime.startswith("image/") or mime == "application/pdf"):
        return FileResponse(str(target), media_type=mime)

    # Everything else → plain text
    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"path": file_path, "content": content, "size": size, "mime": mime or "text/plain"}


@router.get("/runs/{run_id}/hitl")
async def get_hitl_state(run_id: str) -> dict[str, Any]:
    """Read the current HITL session and waiting state for a run."""
    run_dir = _validated_run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    hitl_dir = run_dir / "hitl"
    result: dict[str, Any] = {"run_id": run_id, "waiting": None, "session": None}

    def _read(name: str) -> dict[str, Any] | None:
        p = hitl_dir / name
        if not p.exists():
            return None
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

    result["waiting"] = _read("waiting.json")
    result["session"] = _read("session.json")
    return result


@router.get("/runs/{run_id}/logs")
async def get_run_logs(
    run_id: str,
    tail: int = Query(default=200, ge=1, le=5000),
) -> PlainTextResponse:
    """Read the pipeline.log for a run.

    Args:
        tail: number of lines to return from the end of the file.
    """
    run_dir = _validated_run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    log_paths = [
        run_dir / "pipeline.log",
        run_dir / "run.log",
        run_dir / "researchclaw.log",
    ]
    log_file: Path | None = None
    for p in log_paths:
        if p.exists():
            log_file = p
            break

    if log_file is None:
        return PlainTextResponse("(no log file found)", status_code=200)

    try:
        lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return PlainTextResponse("\n".join(lines[-tail:]))
