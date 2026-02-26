from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator, List, Optional

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import get_session, init_db
from .filter_config import get_filter_ids_path, read_filter_ids, write_filter_ids
from .models import Meter, MeterSettings, RawReading
from .schemas import FilterIdsUpdate, MeterOut, MeterUpdate, UsageSeries, UsagePoint
from .usage import compute_intervals, bucket_intervals, get_recent_power_for_meter


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await init_db()
    yield


app = FastAPI(title="Power Monitor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_session() as session:
        yield session


# Serve built frontend from frontend/dist (same origin as API for /api calls)
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="assets")

    @app.get("/")
    async def root():
        return FileResponse(_FRONTEND_DIST / "index.html")
else:

    @app.get("/", response_class=HTMLResponse)
    async def root() -> str:
        return "<html><body><h1>Power Monitor API</h1><p>Build the frontend (npm run build) to serve the dashboard here.</p></body></html>"


@app.get("/api/meters", response_model=List[MeterOut])
async def list_meters(db: AsyncSession = Depends(get_db)) -> List[MeterOut]:
    subq_last = (
        select(
            RawReading.meter_id,
            func.max(RawReading.timestamp).label("last_ts"),
        )
        .group_by(RawReading.meter_id)
        .subquery()
    )

    q = (
        select(Meter, MeterSettings, subq_last.c.last_ts)
        .select_from(Meter)
        .join(
            subq_last,
            subq_last.c.meter_id == Meter.meter_id,
            isouter=True,
        )
        .join(MeterSettings, MeterSettings.meter_id == Meter.meter_id, isouter=True)
    )

    result = await db.execute(q)
    rows = result.all()
    meters: List[MeterOut] = []
    settings_obj = get_settings()
    window = timedelta(seconds=settings_obj.gauge_window_seconds)
    for meter, settings, last_ts in rows:
        current_kw = await get_recent_power_for_meter(db, meter.meter_id, window)
        meters.append(
            MeterOut(
                meter_id=meter.meter_id,
                label=meter.label,
                active=meter.active,
                last_seen=last_ts,
                current_estimated_kw=current_kw,
                settings=settings,
            )
        )
    return meters


@app.put("/api/meters/{meter_id}", response_model=MeterOut)
async def update_meter(
    meter_id: str, payload: MeterUpdate, db: AsyncSession = Depends(get_db)
) -> MeterOut:
    meter = (
        await db.execute(select(Meter).where(Meter.meter_id == meter_id))
    ).scalar_one_or_none()
    if meter is None:
        meter = Meter(meter_id=meter_id, label=None, active=False)
        db.add(meter)

    if payload.label is not None:
        meter.label = payload.label.strip() or None
    if payload.active is not None:
        meter.active = payload.active

    settings = (
        await db.execute(
            select(MeterSettings).where(MeterSettings.meter_id == meter_id)
        )
    ).scalar_one_or_none()
    if settings is None:
        settings = MeterSettings(meter_id=meter_id)
        db.add(settings)

    if payload.green_max_kw is not None:
        settings.green_max_kw = payload.green_max_kw
    if payload.yellow_max_kw is not None:
        settings.yellow_max_kw = payload.yellow_max_kw
    if payload.red_max_kw is not None:
        settings.red_max_kw = payload.red_max_kw

    await db.commit()
    await db.refresh(meter)

    return MeterOut(
        meter_id=meter.meter_id,
        label=meter.label,
        active=meter.active,
        last_seen=None,
        current_estimated_kw=None,
        settings=settings,
    )


@app.get("/api/usage", response_model=List[UsageSeries])
async def get_usage(
    meters: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    resolution: str = "raw",
    db: AsyncSession = Depends(get_db),
) -> List[UsageSeries]:
    meter_ids: Optional[List[str]] = None
    if meters and meters != "all":
        meter_ids = [m.strip() for m in meters.split(",") if m.strip()]

    # Use local time for query - DB stores local timestamps (matches gauge)
    now_local = datetime.now().astimezone()
    end = now_local.replace(tzinfo=None)  # Always use server "now" so chart shows latest data
    if start is None:
        start = (now_local - timedelta(days=90)).replace(tzinfo=None)
    else:
        start = start.astimezone().replace(tzinfo=None) if start.tzinfo else start

    q = select(RawReading).order_by(RawReading.meter_id, RawReading.timestamp)
    if meter_ids:
        q = q.where(RawReading.meter_id.in_(meter_ids))
    q = q.where(RawReading.timestamp >= start, RawReading.timestamp <= end)

    try:
        rows = (await db.execute(q)).scalars().all()
    except Exception as e:
        logging.exception("Usage query failed: %s", e)
        raise

    by_meter: dict[str, List[RawReading]] = {}
    for r in rows:
        by_meter.setdefault(r.meter_id, []).append(r)

    series_list: List[UsageSeries] = []
    for meter_id, readings in by_meter.items():
        try:
            intervals = compute_intervals(readings)
            bucketed = bucket_intervals(intervals, resolution)
            points: List[UsagePoint] = [
                UsagePoint(timestamp=ts, kwh=kwh, kw=kw) for ts, kwh, kw in bucketed
            ]
            series_list.append(UsageSeries(meter_id=meter_id, points=points))
        except Exception as e:
            logging.exception("Usage processing failed for meter %s: %s", meter_id, e)
            raise

    return series_list


@app.get("/api/gauge/debug")
async def gauge_debug(
    meter_id: str = "55297873",
    window_minutes: int = 30,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Debug why gauge shows --: readings in window, intervals, computed kW."""
    try:
        from .usage import get_recent_power_for_meter, compute_intervals

        window = timedelta(minutes=window_minutes)
        now = datetime.now().astimezone()
        start_time = (now - window).replace(tzinfo=None)

        q = (
            select(RawReading)
            .where(
                RawReading.meter_id == meter_id,
                RawReading.timestamp >= start_time,
            )
            .order_by(RawReading.timestamp)
        )
        rows = (await db.execute(q)).scalars().all()
        intervals = compute_intervals(rows) if len(rows) >= 2 else []
        current_kw = await get_recent_power_for_meter(db, meter_id, window)

        sample_ts = [str(r.timestamp) for r in rows[:5]] if rows else []
        q_recent = (
            select(RawReading.timestamp)
            .where(RawReading.meter_id == meter_id)
            .order_by(RawReading.timestamp.desc())
            .limit(5)
        )
        recent_any = (await db.execute(q_recent)).scalars().all()
        recent_ts = [
            str(r) if isinstance(r, datetime) else str(r[0]) for r in recent_any
        ]
        return {
            "meter_id": meter_id,
            "window_minutes": window_minutes,
            "now_local": now.isoformat(),
            "start_time_local": str(start_time),
            "readings_in_window": len(rows),
            "intervals_produced": len(intervals),
            "current_kw": current_kw,
            "sample_timestamps": sample_ts,
            "recent_in_db_any": recent_ts,
            "note": "recent_in_db_any = latest 5 readings (no time filter). Compare with start_time.",
        }
    except Exception as e:
        import traceback

        return {"error": str(e), "traceback": traceback.format_exc()}


@app.get("/api/usage/debug")
async def usage_debug(db: AsyncSession = Depends(get_db)) -> dict:
    """Diagnostic: readings per meter, intervals produced, to debug empty chart."""
    try:
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=1)
        q = (
            select(RawReading.meter_id, func.count(RawReading.id).label("cnt"))
            .where(RawReading.timestamp >= start)
            .group_by(RawReading.meter_id)
        )
        rows = (await db.execute(q)).all()
        readings_per_meter = {r.meter_id: r.cnt for r in rows}

        # Compute intervals for each meter
        intervals_per_meter: dict[str, int] = {}
        for meter_id in readings_per_meter:
            q2 = (
                select(RawReading)
                .where(
                    RawReading.meter_id == meter_id,
                    RawReading.timestamp >= start,
                )
                .order_by(RawReading.timestamp)
            )
            rrows = (await db.execute(q2)).scalars().all()
            intervals = compute_intervals(rrows)
            intervals_per_meter[meter_id] = len(intervals)

        return {
            "readings_per_meter_24h": readings_per_meter,
            "intervals_per_meter_24h": intervals_per_meter,
            "note": "Need 2+ readings and positive delta_kwh for intervals. If intervals=0, chart will be empty.",
        }
    except Exception as e:
        import traceback

        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


@app.get("/api/usage/anomalies")
async def usage_anomalies(
    date: Optional[str] = None,  # e.g. "2026-02-19"
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Find duplicate readings and large intervals that could cause chart spikes."""
    from sqlalchemy import text

    result: dict = {}
    try:
        # Duplicates: same (meter_id, timestamp) with different cumulative_raw
        dup_q = text("""
            SELECT meter_id, timestamp, COUNT(*) as cnt, GROUP_CONCAT(cumulative_raw) as vals
            FROM raw_readings
            GROUP BY meter_id, timestamp
            HAVING COUNT(*) > 1
            ORDER BY cnt DESC
            LIMIT 20
        """)
        dup_rows = (await db.execute(dup_q)).fetchall()
        result["duplicate_timestamps"] = [
            {
                "meter_id": r[0],
                "timestamp": str(r[1]) if r[1] else None,
                "count": r[2],
                "cumulative_values": r[3],
            }
            for r in dup_rows
        ]

        # Large intervals: find meter+date with unusually high kWh
        if date:
            start_dt = datetime.fromisoformat(date + "T00:00:00+00:00")
            end_dt = start_dt + timedelta(days=1)
            q = (
                select(RawReading)
                .where(RawReading.timestamp >= start_dt, RawReading.timestamp < end_dt)
                .order_by(RawReading.meter_id, RawReading.timestamp)
            )
            rows = (await db.execute(q)).scalars().all()
            by_meter: dict[str, list] = {}
            for r in rows:
                by_meter.setdefault(r.meter_id, []).append(r)
            large: list = []
            for mid, readings in by_meter.items():
                intervals = compute_intervals(readings)
                for p in intervals:
                    if p.delta_kwh > 50:  # > 50 kWh in one interval is suspicious
                        large.append({
                            "meter_id": mid,
                            "timestamp": p.timestamp.isoformat(),
                            "delta_kwh": round(p.delta_kwh, 2),
                            "kw": round(p.kw, 2),
                        })
            result["large_intervals"] = sorted(large, key=lambda x: -x["delta_kwh"])[:20]
        return result
    except Exception as e:
        import traceback

        return {"error": str(e), "traceback": traceback.format_exc()}


@app.get("/api/usage/export")
async def export_usage_csv(
    meters: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
):
    """Export raw readings as CSV. Query params: meters=id1,id2 (required), start=ISO, end=ISO (optional)."""
    meter_ids = [m.strip() for m in (meters or "").split(",") if m.strip()] if meters else None
    if not meter_ids:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Specify meters=id1,id2")
    now_local = datetime.now().astimezone()
    end_dt = now_local.replace(tzinfo=None) if end is None else (end.astimezone().replace(tzinfo=None) if end.tzinfo else end)
    start_dt = (now_local - timedelta(days=90)).replace(tzinfo=None) if start is None else (start.astimezone().replace(tzinfo=None) if start.tzinfo else start)
    q = (
        select(RawReading)
        .where(RawReading.meter_id.in_(meter_ids))
        .where(RawReading.timestamp >= start_dt, RawReading.timestamp <= end_dt)
        .order_by(RawReading.meter_id, RawReading.timestamp)
    )
    rows = (await db.execute(q)).scalars().all()
    lines = ["meter_id,timestamp,cumulative_raw"]
    for r in rows:
        ts = r.timestamp.isoformat() if (r.timestamp and getattr(r.timestamp, "tzinfo", None)) else str(r.timestamp)
        lines.append(f"{r.meter_id},{ts},{r.cumulative_raw}")
    body = "\n".join(lines).encode("utf-8")
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=power_usage_export.csv"},
    )


@app.get("/api/config/filter-ids")
async def get_filter_ids() -> dict:
    """Return current filter IDs (from file or env). Empty = discovery mode."""
    ids = read_filter_ids()
    return {"meter_ids": ids}


@app.put("/api/config/filter-ids")
async def put_filter_ids(payload: FilterIdsUpdate) -> dict:
    """Write selected meter IDs to filter_ids.txt. Collector will use these on next restart."""
    write_filter_ids(payload.meter_ids)
    return {"meter_ids": payload.meter_ids}


@app.get("/api/status")
async def status(db: AsyncSession = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)
    settings = get_settings()
    last_reading_ts = (
        await db.execute(select(func.max(RawReading.timestamp)))
    ).scalar_one_or_none()
    meter_count = (await db.execute(select(func.count(Meter.id)))).scalar_one()
    return {
        "time": now.isoformat(),
        "database_path": str(settings.database_path),
        "last_reading": last_reading_ts.isoformat() if last_reading_ts else None,
        "meter_count": meter_count,
    }

