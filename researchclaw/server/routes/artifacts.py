"""Artifact browsing and log API routes."""

from __future__ import annotations

import json
import logging
import mimetypes
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["artifacts"])


def _safe_run_dir(run_id: str) -> Path:
    """Validate run_id and return resolved run directory under artifacts/."""
    artifacts = Path("artifacts").resolve()
    run_dir = (artifacts / run_id).resolve()
    if not str(run_dir).startswith(str(artifacts)):
        raise HTTPException(status_code=400, detail="Invalid run_id")
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return run_dir


def _build_tree(root: Path, rel_prefix: str = "") -> dict[str, Any]:
    """Recursively build artifact tree."""
    name = root.name
    rel_path = f"{rel_prefix}/{name}" if rel_prefix else name
    if root.is_dir():
        children: list[dict[str, Any]] = []
        try:
            for child in sorted(root.iterdir()):
                children.append(_build_tree(child, rel_path))
        except OSError as exc:
            logger.debug("Failed to list %s: %s", root, exc)
        return {
            "name": name,
            "path": rel_path,
            "type": "directory",
            "children": children,
        }
    else:
        stat = root.stat()
        return {
            "name": name,
            "path": rel_path,
            "type": "file",
            "size": stat.st_size,
            "mtime": stat.st_mtime,
        }


@router.get("/runs/{run_id}/artifacts")
async def list_artifacts(run_id: str) -> dict[str, Any]:
    """List all artifacts for a run as a tree."""
    run_dir = _safe_run_dir(run_id)
    tree = _build_tree(run_dir)
    return {"run_id": run_id, "tree": tree}


@router.get("/runs/{run_id}/artifacts/{path:path}")
async def get_artifact(run_id: str, path: str) -> dict[str, Any]:
    """Read a specific artifact file."""
    run_dir = _safe_run_dir(run_id)
    # Prevent path traversal
    safe_path = Path(path).name if ".." in path else path
    file_path = (run_dir / safe_path).resolve()
    if not str(file_path).startswith(str(run_dir.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    mime_type, _ = mimetypes.guess_type(str(file_path))
    mime_type = mime_type or "application/octet-stream"

    # Text-like files
    text_extensions = {
        ".md",
        ".txt",
        ".json",
        ".yaml",
        ".yml",
        ".py",
        ".tex",
        ".bib",
        ".log",
        ".csv",
        ".sh",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".css",
        ".html",
        ".xml",
        ".ini",
        ".cfg",
        ".dockerfile",
        ".gitignore",
    }

    if mime_type.startswith("text/") or file_path.suffix.lower() in text_extensions:
        try:
            content = file_path.read_text(encoding="utf-8", errors="replace")
            return {
                "path": path,
                "mime_type": mime_type,
                "content": content,
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Read error: {exc}")
    else:
        # Binary files — return base64 or just metadata
        import base64

        try:
            data = file_path.read_bytes()
            return {
                "path": path,
                "mime_type": mime_type,
                "content": base64.b64encode(data).decode("ascii"),
                "encoding": "base64",
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Read error: {exc}")


@router.get("/runs/{run_id}/logs")
async def get_logs(run_id: str, tail: int = Query(200, ge=1, le=2000)) -> dict[str, Any]:
    """Read pipeline.log tail lines."""
    run_dir = _safe_run_dir(run_id)
    log_path = run_dir / "pipeline.log"
    if not log_path.exists():
        return {"run_id": run_id, "lines": [], "total_lines": 0}

    try:
        text = log_path.read_text(encoding="utf-8", errors="replace")
        all_lines = text.splitlines()
        lines = all_lines[-tail:] if len(all_lines) > tail else all_lines
        return {
            "run_id": run_id,
            "lines": lines,
            "total_lines": len(all_lines),
            "tail": tail,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Read error: {exc}")


@router.get("/runs/{run_id}/hitl")
async def get_hitl_status(run_id: str) -> dict[str, Any]:
    """Read HITL session and waiting state."""
    run_dir = _safe_run_dir(run_id)
    hitl_dir = run_dir / "hitl"
    session_data = None
    waiting_data = None

    session_path = hitl_dir / "session.json"
    if session_path.exists():
        try:
            with session_path.open() as f:
                session_data = json.load(f)
        except Exception:
            pass

    waiting_path = hitl_dir / "waiting.json"
    if waiting_path.exists():
        try:
            with waiting_path.open() as f:
                waiting_data = json.load(f)
        except Exception:
            pass

    return {"run_id": run_id, "session": session_data, "waiting": waiting_data}
