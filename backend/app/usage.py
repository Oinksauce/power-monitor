from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import RawReading


@dataclass
class IntervalPoint:
    timestamp: datetime
    delta_kwh: float
    kw: float


async def get_recent_power_for_meter(
    db: AsyncSession, meter_id: str, window: timedelta
) -> float | None:
    """Compute average kW for the given meter over a trailing time window."""
    now = datetime.now(timezone.utc)
    start_time = now - window

    q = (
        select(RawReading)
        .where(
            RawReading.meter_id == meter_id,
            RawReading.timestamp >= start_time,
        )
        .order_by(RawReading.timestamp)
    )
    rows: List[RawReading] = (await db.execute(q)).scalars().all()
    if len(rows) < 2:
        return None

    points = compute_intervals(rows)
    if not points:
        return None

    total_kwh = sum(p.delta_kwh for p in points)
    total_hours = sum(
        (points[i].timestamp - points[i - 1].timestamp).total_seconds() / 3600.0
        for i in range(1, len(points))
    )
    if total_hours <= 0:
        return None
    return total_kwh / total_hours


def _ensure_utc(dt: datetime) -> datetime:
    """Normalize to UTC-aware; SQLite may return naive datetimes."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def compute_intervals(readings: Iterable[RawReading]) -> List[IntervalPoint]:
    """Convert cumulative readings into interval energy/power points."""
    readings_list = list(readings)
    points: List[IntervalPoint] = []
    for prev, cur in zip(readings_list, readings_list[1:]):
        prev_ts = _ensure_utc(prev.timestamp)
        cur_ts = _ensure_utc(cur.timestamp)
        dt_h = (cur_ts - prev_ts).total_seconds() / 3600.0
        if dt_h <= 0:
            continue
        delta_kwh = cur.cumulative_kwh - prev.cumulative_kwh
        if delta_kwh < 0:
            continue
        kw = delta_kwh / dt_h
        points.append(
            IntervalPoint(
                timestamp=cur_ts,
                delta_kwh=delta_kwh,
                kw=kw,
            )
        )
    return points


def bucket_intervals(
    points: Iterable[IntervalPoint], resolution: str
) -> List[Tuple[datetime, float, float]]:
    """Aggregate interval points into time buckets.

    Returns list of (bucket_start, kwh, kw).
    """
    if resolution == "raw":
        return [(p.timestamp, p.delta_kwh, p.kw) for p in points]

    # Map resolution string to bucket size in minutes
    res_minutes = {
        "1m": 1,
        "5m": 5,
        "15m": 15,
        "1h": 60,
        "1d": 24 * 60,
    }.get(resolution, 0)

    if res_minutes <= 0:
        return [(p.timestamp, p.delta_kwh, p.kw) for p in points]

    bucket_size = timedelta(minutes=res_minutes)
    buckets: Dict[datetime, List[IntervalPoint]] = defaultdict(list)

    for p in points:
        ts = p.timestamp
        # Floor to bucket start
        bucket_start = ts - timedelta(
            minutes=(ts.minute % res_minutes),
            seconds=ts.second,
            microseconds=ts.microsecond,
        )
        buckets[bucket_start].append(p)

    aggregated: List[Tuple[datetime, float, float]] = []
    for bucket_start, bucket_points in sorted(buckets.items()):
        total_kwh = sum(bp.delta_kwh for bp in bucket_points)
        hours = bucket_size.total_seconds() / 3600.0
        kw = total_kwh / hours if hours > 0 else 0.0
        aggregated.append((bucket_start, total_kwh, kw))

    return aggregated

