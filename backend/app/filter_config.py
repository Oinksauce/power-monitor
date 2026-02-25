"""Read/write meter filter IDs. Used by API and collector."""

from __future__ import annotations

import os
from pathlib import Path

from .config import get_settings


def get_filter_ids_path() -> Path:
    """Path to filter_ids.txt (next to database, writable by app)."""
    settings = get_settings()
    return settings.database_path.parent / "filter_ids.txt"


def read_filter_ids() -> list[str]:
    """
    Get filter IDs: from filter_ids.txt if it exists, else from POWER_MONITOR_FILTER_IDS env.
    Returns list of meter IDs (empty = discovery mode).
    """
    path = get_filter_ids_path()
    if path.exists():
        try:
            raw = path.read_text().strip()
            if raw:
                return [m.strip() for m in raw.split(",") if m.strip()]
            return []
        except OSError:
            pass
    env_val = (os.getenv("POWER_MONITOR_FILTER_IDS") or "").strip()
    if env_val:
        return [m.strip() for m in env_val.split(",") if m.strip()]
    return []


def write_filter_ids(meter_ids: list[str]) -> None:
    """Write meter IDs to filter_ids.txt. Empty list = discovery mode."""
    path = get_filter_ids_path()
    content = ",".join(meter_ids) if meter_ids else ""
    path.write_text(content)
