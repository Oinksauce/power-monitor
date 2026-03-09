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
    start_ts: datetime | None = None


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


def compute_intervals(readings: Iterable[RawReading]) -> List[IntervalPoint]:
    """Convert cumulative readings into interval energy/power points."""
    readings_list = list(readings)
    points: List[IntervalPoint] = []
    for prev, cur in zip(readings_list, readings_list[1:]):
        prev_ts = _ensure_local(prev.timestamp)
        cur_ts = _ensure_local(cur.timestamp)
        dt_h = (cur_ts - prev_ts).total_seconds() / 3600.0
        if dt_h <= 0:
            continue
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
                start_ts=prev_ts
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


async def sweep_intervals(db: AsyncSession) -> int:
    from .models import Meter, Interval
    meters = (await db.execute(select(Meter.meter_id))).scalars().all()
    
    total_inserted = 0
    for meter_id in meters:
        last_interval_end = (
            await db.execute(
                select(Interval.end_ts)
                .where(Interval.meter_id == meter_id)
                .order_by(Interval.end_ts.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        
        q = select(RawReading).where(RawReading.meter_id == meter_id).order_by(RawReading.timestamp)
        if last_interval_end:
            # Re-fetch from the reading that matches last_interval_end
            q = q.where(RawReading.timestamp >= last_interval_end)
            
        readings = (await db.execute(q)).scalars().all()
        if len(readings) < 2:
            continue
            
        points = compute_intervals(readings)
        inserts = []
        for p in points:
            if last_interval_end and _ensure_local(p.timestamp) <= _ensure_local(last_interval_end):
                continue
            inserts.append(
                Interval(
                    meter_id=meter_id,
                    start_ts=p.start_ts,
                    end_ts=p.timestamp,
                    delta_kwh=p.delta_kwh,
                    avg_kw=p.kw
                )
            )
        if inserts:
            db.add_all(inserts)
            try:
                await db.commit()
                total_inserted += len(inserts)
            except Exception:
                await db.rollback()
            
    return total_inserted


async def sweep_intervals_loop() -> None:
    from .database import get_session_factory
    import logging
    import asyncio
    logger = logging.getLogger("power_monitor.sweeper")
    session_factory = get_session_factory()
    
    # Run a sweep on startup
    try:
        async with session_factory() as db:
            n = await sweep_intervals(db)
            if n > 0:
                logger.info("Swept %d new intervals on startup", n)
    except Exception as e:
        logger.error("Startup sweep failed: %s", e)

    while True:
        await asyncio.sleep(60)
        try:
            async with session_factory() as db:
                n = await sweep_intervals(db)
                if n > 0:
                    logger.debug("Swept %d new intervals", n)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Periodic sweep failed: %s", e)

def extract_high_consumption_events(
    points: List[IntervalPoint], 
    baseload_kw: float, 
    threshold_w: float = 500.0, 
    min_duration_minutes: float = 10.0
) -> List[dict]:
    """
    Finds sustained periods where power draw exceeds baseload + threshold.
    Identifies likely appliances based on docs/appliance_signatures.json.
    Returns a list of event dictionaries: {appliance, kwh, duration_min, avg_kw}
    """
    import json
    from pathlib import Path

    # Load signatures (relative to project root usually)
    signatures = []
    try:
        sig_path = Path(__file__).resolve().parent.parent.parent / "docs" / "appliance_signatures.json"
        if sig_path.exists():
            data = json.loads(sig_path.read_text())
            signatures = data.get("appliance_signatures", [])
    except Exception:
        pass

    def identify_appliance(event_avg_kw: float) -> str:
        if not signatures:
            return "Unknown High Load"
        
        event_w = event_avg_kw * 1000.0
        best_match = "Unknown High Load"
        min_diff = float("inf")
        
        # Simple matching: find closest typical_w within 25% tolerance
        for sig in signatures:
            typical_w = sig.get("typical_w", 0)
            diff = abs(event_w - typical_w)
            if diff < min_diff and diff < (typical_w * 0.25):
                min_diff = diff
                best_match = sig.get("name", "Unknown")
        
        return best_match

    threshold_kw = baseload_kw + (threshold_w / 1000.0)
    
    events = []
    current_event_kwh = 0.0
    current_event_duration = 0.0
    current_event_points = []
    in_event = False
    
    for p in points:
        if p.kw >= threshold_kw:
            if not in_event:
                in_event = True
                current_event_kwh = 0.0
                current_event_duration = 0.0
                current_event_points = []
            
            # accumulate
            current_event_kwh += p.delta_kwh
            current_event_points.append(p.kw)
            duration_hours = p.delta_kwh / p.kw if p.kw > 0 else 0
            current_event_duration += duration_hours * 60.0
        else:
            if in_event:
                if current_event_duration >= min_duration_minutes:
                    avg_kw = sum(current_event_points) / len(current_event_points) if current_event_points else 0
                    # Identify based on the added load (above baseload)
                    appliance_name = identify_appliance(avg_kw - baseload_kw)
                    events.append({
                        "appliance": appliance_name,
                        "kwh": current_event_kwh,
                        "duration_min": current_event_duration,
                        "avg_kw": avg_kw
                    })
                in_event = False
                
    # Check if last event finished at the end of the array
    if in_event and current_event_duration >= min_duration_minutes:
        avg_kw = sum(current_event_points) / len(current_event_points) if current_event_points else 0
        appliance_name = identify_appliance(avg_kw - baseload_kw)
        events.append({
            "appliance": appliance_name,
            "kwh": current_event_kwh,
            "duration_min": current_event_duration,
            "avg_kw": avg_kw
        })
        
    return events
