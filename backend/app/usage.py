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
    # Use local time - SQLite/rtlamr typically store local timestamps
    now = datetime.now().astimezone()
    start_time = (now - window).replace(tzinfo=None)  # naive for SQLite comparison

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
    if total_hours > 0:
        return total_kwh / total_hours
    # Single interval: use its kw directly
    if len(points) == 1:
        return points[0].kw
    return None


def _ensure_local(dt: datetime) -> datetime:
    """Normalize to timezone-aware; SQLite stores local time, treat naive as local."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.now().astimezone().tzinfo)
    return dt


# Sanity limits: skip intervals that imply impossible consumption
# (e.g. meter rollover, corruption, or bad data)
MAX_DELTA_KWH = 100.0  # > 100 kWh in one interval is suspicious
MAX_KW = 500.0  # > 500 kW sustained is impossible for residential

# Minimum interval duration (hours). Intervals shorter than this are skipped to avoid
# spikes from "delta over a few seconds" (e.g. two readings 10s apart → huge kW).
MIN_INTERVAL_HOURS = 1.0 / 60.0  # 1 minute


def compute_intervals(readings: Iterable[RawReading]) -> List[IntervalPoint]:
    """Convert cumulative readings into interval energy/power points.

    For each pair of consecutive readings (prev, cur):
    - delta_kwh = change in cumulative kWh (energy used in that span)
    - kw = delta_kwh / hours (average power over the interval; no smoothing)
    Intervals that are too short, negative, or exceed sanity limits are skipped.
    """
    readings_list = list(readings)
    points: List[IntervalPoint] = []
    for prev, cur in zip(readings_list, readings_list[1:]):
        prev_ts = _ensure_local(prev.timestamp)
        cur_ts = _ensure_local(cur.timestamp)
        dt_h = (cur_ts - prev_ts).total_seconds() / 3600.0
        if dt_h < MIN_INTERVAL_HOURS:
            continue  # Skip very short intervals that cause spikes
        delta_kwh = cur.cumulative_kwh - prev.cumulative_kwh
        if delta_kwh < 0:
            continue
        kw = delta_kwh / dt_h
        if delta_kwh > MAX_DELTA_KWH or kw > MAX_KW:
            continue  # Skip anomalous intervals (rollover, corruption)
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
        # Floor to bucket start (minutes since midnight for daily buckets)
        mins_since_midnight = ts.hour * 60 + ts.minute
        bucket_start = ts - timedelta(
            minutes=(mins_since_midnight % res_minutes),
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

