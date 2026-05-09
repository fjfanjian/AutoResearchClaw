"""Dashboard state broadcaster — pushes updates via WebSocket."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from researchclaw.dashboard.collector import DashboardCollector, RunSnapshot
from researchclaw.server.websocket.events import Event, EventType
from researchclaw.server.websocket.manager import ConnectionManager

logger = logging.getLogger(__name__)


class DashboardBroadcaster:
    """Periodically collect run data and broadcast changes."""

    def __init__(
        self,
        manager: ConnectionManager,
        collector: DashboardCollector,
    ) -> None:
        self._manager = manager
        self._collector = collector
        self._prev_snapshots: dict[str, dict[str, Any]] = {}
        self._log_line_counts: dict[str, int] = {}

    async def tick(self) -> None:
        """Collect current state and broadcast changes."""
        snapshots = self._collector.collect_all()
        current: dict[str, dict[str, Any]] = {}

        for snap in snapshots:
            d = snap.to_dict()
            current[snap.run_id] = d

            prev = self._prev_snapshots.get(snap.run_id)
            if prev is None:
                # New run discovered
                await self._manager.broadcast(
                    Event(type=EventType.RUN_DISCOVERED, data=d)
                )
                self._log_line_counts[snap.run_id] = len(snap.last_log_lines)
            else:
                # Check for stage changes
                if d["current_stage"] != prev.get("current_stage"):
                    await self._manager.broadcast(
                        Event(
                            type=EventType.STAGE_COMPLETE
                            if d["current_stage"] > prev.get("current_stage", 0)
                            else EventType.RUN_STATUS_CHANGED,
                            data=d,
                        )
                    )
                elif d["status"] != prev.get("status"):
                    await self._manager.broadcast(
                        Event(type=EventType.RUN_STATUS_CHANGED, data=d)
                    )
                # Check for metric updates
                if d["metrics"] and d["metrics"] != prev.get("metrics"):
                    await self._manager.broadcast(
                        Event(
                            type=EventType.METRIC_UPDATE,
                            data={"run_id": snap.run_id, "metrics": d["metrics"]},
                        )
                    )
                # Check for new log lines
                prev_count = self._log_line_counts.get(snap.run_id, 0)
                current_lines = snap.last_log_lines
                if len(current_lines) > prev_count:
                    new_lines = current_lines[prev_count:]
                    for line in new_lines[-50:]:  # limit to 50 new lines per tick
                        await self._manager.broadcast(
                            Event(
                                type=EventType.LOG_LINE,
                                data={"run_id": snap.run_id, "line": line},
                            )
                        )
                    self._log_line_counts[snap.run_id] = len(current_lines)

        self._prev_snapshots = current


async def start_dashboard_loop(
    manager: ConnectionManager,
    interval: int = 5,
    monitor_dir: str | None = None,
) -> None:
    """Background task that periodically broadcasts dashboard updates."""
    collector = DashboardCollector()
    broadcaster = DashboardBroadcaster(manager, collector)

    while True:
        try:
            await broadcaster.tick()
        except Exception:
            logger.exception("Dashboard broadcast error")
        await asyncio.sleep(interval)
