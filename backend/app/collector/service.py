from __future__ import annotations

import asyncio
import csv
import logging
import os
import signal
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from dateutil import parser as dateutil_parser
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..filter_config import read_filter_ids
from ..database import get_engine, get_session_factory
from ..models import Meter, RawReading


logger = logging.getLogger("power_monitor.collector")
logging.basicConfig(level=logging.INFO)


@dataclass
class ParsedReading:
    timestamp: datetime
    meter_id: str
    cumulative_raw: int


def parse_rtlamr_csv_line(line: str) -> Optional[ParsedReading]:
    line = line.strip()
    if not line:
        return None
    # Skip rtlamr's internal log/debug lines (mixed with CSV on stdout)
    if ".go:" in line or "decode.go" in line or "main.go" in line:
        return None
    try:
        row = next(csv.reader([line]))
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to parse CSV line: %s (%s)", line, exc)
        return None

    # rtlamr -format=csv outputs data lines with 8+ columns; log/debug lines have fewer
    if len(row) < 8:
        return None

    # Expected columns (indices based on sample):
    # 0: timestamp, 3: meter_id, 7: cumulative_raw
    try:
        ts_raw = row[0]
        meter_id = row[3]
        cumulative_raw = int(row[7])
    except (IndexError, ValueError):
        return None

    try:
        # dateutil handles nanosecond fractions and timezone offsets
        timestamp = dateutil_parser.isoparse(ts_raw)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to parse timestamp %s (%s)", ts_raw, exc)
        return None

    return ParsedReading(timestamp=timestamp, meter_id=meter_id, cumulative_raw=cumulative_raw)


async def persist_reading(session: AsyncSession, reading: ParsedReading) -> None:
    meter = (
        await session.execute(select(Meter).where(Meter.meter_id == reading.meter_id))
    ).scalar_one_or_none()
    if meter is None:
        meter = Meter(meter_id=reading.meter_id, label=None, active=False)
        session.add(meter)

    model = RawReading(
        meter_id=reading.meter_id,
        timestamp=reading.timestamp,
        cumulative_raw=reading.cumulative_raw,
        cumulative_kwh=reading.cumulative_raw / 100.0,
        source="rtlamr",
    )
    session.add(model)
    try:
        await session.commit()
    except IntegrityError:
        # Duplicate reading, ignore
        await session.rollback()


async def _run_rtlamr_stream(session: AsyncSession) -> None:
    settings = get_settings()
    rtl_tcp_path = settings.rtl_tcp_path
    rtlamr_path = settings.rtlamr_path
    host = settings.rtltcp_host
    port = settings.rtltcp_port

    # Start rtl_tcp (keep running for the whole session)
    logger.info("Starting rtl_tcp on %s:%s", host, port)
    rtl_tcp_proc = await asyncio.create_subprocess_exec(
        rtl_tcp_path,
        "-a",
        host,
        "-p",
        str(port),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.STDOUT,
    )

    # Give rtl_tcp time to initialize
    await asyncio.sleep(7)

    unique = os.getenv("POWER_MONITOR_UNIQUE", "true").lower()
    unique_arg = ["-unique=true"] if unique in {"1", "true", "yes"} else []

    def _build_args() -> list[str]:
        args = [rtlamr_path, "-format=csv", "-server", f"{host}:{port}"]
        filter_ids_list = read_filter_ids()
        if filter_ids_list:
            args.extend(["-filterid", ",".join(filter_ids_list)])
        else:
            logger.info("No filter IDs set; discovery mode (collecting all meters)")
        args.extend(unique_arg)
        return args

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _handle_signal(*_: object) -> None:
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            # Signals may not be available on some platforms
            pass

    try:
        while not stop_event.is_set():
            args = _build_args()
            logger.info("Starting rtlamr with args: %s", " ".join(args))
            rtlamr_proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
            )
            assert rtlamr_proc.stdout is not None
            try:
                while not stop_event.is_set():
                    line_bytes = await rtlamr_proc.stdout.readline()
                    if not line_bytes:
                        break
                    line = line_bytes.decode("utf-8", errors="ignore")
                    reading = parse_rtlamr_csv_line(line)
                    if reading is None:
                        continue
                    await persist_reading(session, reading)
            except asyncio.CancelledError:
                raise
            finally:
                if rtlamr_proc.returncode is None:
                    rtlamr_proc.terminate()
                    await rtlamr_proc.wait()

            if stop_event.is_set():
                break
            logger.warning(
                "rtlamr exited (returncode=%s), restarting in 5s...",
                rtlamr_proc.returncode,
            )
            await asyncio.sleep(5)
    finally:
        logger.info("Shutting down collector processes")
        if rtl_tcp_proc.returncode is None:
            rtl_tcp_proc.terminate()
        await rtl_tcp_proc.wait()


async def replay_from_csv(csv_path: str) -> None:
    """Replay readings from a CSV file for testing."""
    get_engine()  # ensure engine is initialized
    session_factory = get_session_factory()

    async with session_factory() as session:
        with open(csv_path, "r", encoding="utf-8") as f:
            for line in f:
                reading = parse_rtlamr_csv_line(line)
                if reading is None:
                    continue
                await persist_reading(session, reading)


async def run_collector() -> None:
    """Entry point for the collector service."""
    replay_path = os.getenv("POWER_MONITOR_REPLAY_CSV")
    if replay_path:
        logger.info("Running collector in replay mode from %s", replay_path)
        await replay_from_csv(replay_path)
        return

    get_engine()
    session_factory = get_session_factory()
    async with session_factory() as session:
        await _run_rtlamr_stream(session)


def main() -> None:
    asyncio.run(run_collector())


if __name__ == "__main__":
    main()

