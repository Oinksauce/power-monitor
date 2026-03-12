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
    Returns a list of event dictionaries: {appliance, kwh, duration_min, avg_kw, start_ts, end_ts}
    """
    import json
    from pathlib import Path

    # Load signatures
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
    current_start_ts = None
    in_event = False
    
    for p in points:
        if p.kw >= threshold_kw:
            if not in_event:
                in_event = True
                current_event_kwh = 0.0
                current_event_duration = 0.0
                current_event_points = []
                current_start_ts = p.start_ts or p.timestamp
            
            current_event_kwh += p.delta_kwh
            current_event_points.append(p.kw)
            duration_hours = p.delta_kwh / p.kw if p.kw > 0 else 0
            current_event_duration += duration_hours * 60.0
        else:
            if in_event:
                if current_event_duration >= min_duration_minutes:
                    avg_kw = sum(current_event_points) / len(current_event_points) if current_event_points else 0
                    appliance_name = identify_appliance(avg_kw - baseload_kw)
                    events.append({
                        "appliance": appliance_name,
                        "kwh": current_event_kwh,
                        "duration_min": current_event_duration,
                        "avg_kw": avg_kw,
                        "start_ts": current_start_ts,
                        "end_ts": p.timestamp
                    })
                in_event = False
                
    if in_event and current_event_duration >= min_duration_minutes:
        avg_kw = sum(current_event_points) / len(current_event_points) if current_event_points else 0
        appliance_name = identify_appliance(avg_kw - baseload_kw)
        events.append({
            "appliance": appliance_name,
            "kwh": current_event_kwh,
            "duration_min": current_event_duration,
            "avg_kw": avg_kw,
            "start_ts": current_start_ts,
            "end_ts": points[-1].timestamp
        })
        
    return events


async def sweep_events(db: AsyncSession) -> int:
    """Identify high-consumption events from Interval table and log to EventLog."""
    from .models import Interval, EventLog, Meter
    
    # 1. For each meter, find the latest end_ts in EventLog
    meters = (await db.execute(select(Meter.meter_id))).scalars().all()
    total_new = 0
    
    for meter_id in meters:
        last_event_end = (
            await db.execute(
                select(EventLog.end_ts)
                .where(EventLog.meter_id == meter_id)
                .order_by(EventLog.end_ts.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        
        # 2. Query last 3 days of intervals to ensure we have context for baseload
        # but only process new ones since last_event_end
        now = datetime.now().astimezone().replace(tzinfo=None)
        q = select(Interval).where(Interval.meter_id == meter_id).order_by(Interval.start_ts)
        # Fetch a reasonable window to calculate baseload accurately
        q_window = q.where(Interval.start_ts >= now - timedelta(days=3))
        
        rows = (await db.execute(q_window)).scalars().all()
        if not rows:
            continue
            
        points = [
            IntervalPoint(timestamp=r.end_ts, delta_kwh=r.delta_kwh, kw=r.avg_kw, start_ts=r.start_ts)
            for r in rows
        ]
        
        # Calculate local baseload from this window
        # Group into 1h buckets for baseload calculation
        buckets: Dict[datetime, List[float]] = defaultdict(list)
        for p in points:
            bucket_ts = p.timestamp.replace(minute=0, second=0, microsecond=0)
            buckets[bucket_ts].append(p.kw)
        
        hourly_avg = []
        for b_ts, kws in buckets.items():
            if kws:
                hourly_avg.append(sum(kws) / len(kws))
        
        baseload = min([v for v in hourly_avg if v > 0], default=0.2)
        
        # Extract events
        all_detected = None
        import os
        from pathlib import Path
        import json
        from .mcp_client import ApplianceMCPClient
        import logging
        
        mcp_logger = logging.getLogger("power_monitor.sweeper")
        mcp_api_key = os.environ.get("MCP_API_KEY", "")
        
        if mcp_api_key:
            try:
                mcp_client = ApplianceMCPClient(
                    mcp_api_key, 
                    "https://lab.leapter.com/runtime/api/v1/f029ac21-992c-4047-871c-a032d21995cf/e358426a-27b3-4c90-921c-a74c364d095c/mcp/sse"
                )
                await mcp_client.initialize()
                
                # Format interval points for the MCP tool
                mcp_points = [
                    {
                        "timestamp": p.timestamp.isoformat(), 
                        "kw": p.kw, 
                        "delta_kwh": p.delta_kwh,
                        "start_ts": p.start_ts.isoformat() if p.start_ts else None
                    }
                    for p in points
                ]
                
                # Load appliance signatures (only a slice to prevent LLM timeouts for now)
                signatures = []
                sig_path = Path(__file__).resolve().parent.parent.parent / "docs" / "appliance_signatures.json"
                if sig_path.exists():
                    sigs_data = json.loads(sig_path.read_text())
                    signatures = sigs_data.get("appliance_signatures", [])[:5]
                
                mcp_result = await mcp_client.analyze_usage(mcp_points, signatures)
                if mcp_result and isinstance(mcp_result, list) and all(isinstance(x, dict) and 'start_ts' in x and 'appliance' in x for x in mcp_result):
                    mcp_logger.info(f"MCP Server successfully detected {len(mcp_result)} events.")
                    # Format start/end timestamps properly
                    for e in mcp_result:
                        if isinstance(e.get("start_ts"), str):
                            e["start_ts"] = datetime.fromisoformat(e["start_ts"])
                        if isinstance(e.get("end_ts"), str):
                            e["end_ts"] = datetime.fromisoformat(e["end_ts"])
                    all_detected = mcp_result
                else:
                    mcp_logger.warning(f"MCP response was empty or invalid (not an event list). Falling back to local logic. Result: {mcp_result}")
                await mcp_client.close()
            except Exception as e:
                mcp_logger.error(f"MCP Client failed during interval sweep: {e}. Falling back to local logic.")
                
        if all_detected is None:
            all_detected = extract_high_consumption_events(points, baseload_kw=baseload, threshold_w=500.0, min_duration_minutes=5.0)
        
        # Filter only those that start AFTER last_event_end
        new_events = []
        for e in all_detected:
            # e['start_ts'] is aware? no, Interval uses local naive.
            if last_event_end and _ensure_local(e["start_ts"]) <= _ensure_local(last_event_end):
                continue
            
            new_events.append(
                EventLog(
                    meter_id=meter_id,
                    start_ts=e["start_ts"],
                    end_ts=e["end_ts"],
                    avg_kw=e["avg_kw"],
                    kwh=e["kwh"],
                    identified_appliance=e["appliance"],
                    status="unverified"
                )
            )
        
        if new_events:
            db.add_all(new_events)
            await db.commit()
            total_new += len(new_events)
            
    return total_new


async def sweep_intervals_loop() -> None:
    from .database import get_session_factory
    import logging
    import asyncio
    logger = logging.getLogger("power_monitor.sweeper")
    session_factory = get_session_factory()
    
    # Run a sweep on startup
    try:
        async with session_factory() as db:
            n_int = await sweep_intervals(db)
            if n_int > 0:
                logger.info("Swept %d new intervals on startup", n_int)
            
            n_ev = await sweep_events(db)
            if n_ev > 0:
                logger.info("Identified %d new high-impact events on startup", n_ev)
    except Exception as e:
        logger.error("Startup sweep failed: %s", e)

    while True:
        await asyncio.sleep(60)
        try:
            async with session_factory() as db:
                n_int = await sweep_intervals(db)
                if n_int > 0:
                    logger.debug("Swept %d new intervals", n_int)
                
                n_ev = await sweep_events(db)
                if n_ev > 0:
                    logger.info("Identified %d new high-impact events", n_ev)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Periodic sweep failed: %s", e)
