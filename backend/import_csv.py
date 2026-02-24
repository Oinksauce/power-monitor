#!/usr/bin/env python3
"""Import CSV data into the power monitor database. Uses stdlib only (no pip install).
Run from project root:
    cd backend && python3 import_csv.py ../electricusage.csv
Or with venv on Pi:
    POWER_MONITOR_DB_PATH=../power_monitor.db .venv/bin/python import_csv.py ../electricusage.csv
"""
from __future__ import annotations

import csv
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

def parse_timestamp(ts_raw: str) -> datetime | None:
    """Parse ISO timestamp; truncate nanoseconds for stdlib fromisoformat."""
    try:
        # fromisoformat supports up to 6 fractional digits; truncate if longer
        if "." in ts_raw:
            base, rest = ts_raw.split(".", 1)
            # rest may be "665421351-05:00" - extract digits and timezone
            digits = ""
            tz_part = ""
            for c in rest:
                if c.isdigit():
                    digits += c
                else:
                    tz_part = rest[len(digits) :]
                    break
            frac = (digits[:6] + "000000")[:6]  # truncate to 6
            ts_raw = f"{base}.{frac}{tz_part}"
        ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def parse_row(row: list[str]) -> tuple[str, datetime, int] | None:
    """Parse rtlamr CSV row: (meter_id, timestamp, cumulative_raw)."""
    if len(row) < 8:
        return None
    try:
        ts_raw = row[0]
        meter_id = str(row[3])
        cumulative_raw = int(row[7])
        timestamp = parse_timestamp(ts_raw)
        if timestamp is None:
            return None
        return (meter_id, timestamp, cumulative_raw)
    except (ValueError, IndexError):
        return None


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python import_csv.py <path-to-csv>")
        print("Example: python import_csv.py ../electricusage.csv")
        sys.exit(1)
    csv_path = Path(sys.argv[1]).resolve()
    if not csv_path.is_file():
        print(f"Error: File not found: {csv_path}")
        sys.exit(1)

    db_path = Path(
        os.environ.get("POWER_MONITOR_DB_PATH", "power_monitor.db")
    ).expanduser()
    db_path = db_path.resolve()

    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS meters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meter_id TEXT UNIQUE NOT NULL,
            label TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            active INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS raw_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meter_id TEXT NOT NULL REFERENCES meters(meter_id),
            timestamp TIMESTAMP NOT NULL,
            cumulative_raw INTEGER NOT NULL,
            cumulative_kwh REAL NOT NULL,
            source TEXT DEFAULT 'rtlamr',
            UNIQUE(meter_id, timestamp, cumulative_raw)
        );
        CREATE INDEX IF NOT EXISTS ix_raw_readings_meter_ts ON raw_readings(meter_id, timestamp);
    """)

    seen_meters: set[str] = set()
    inserted = 0
    skipped = 0

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            parsed = parse_row(row)
            if parsed is None:
                continue
            meter_id, timestamp, cumulative_raw = parsed
            cumulative_kwh = cumulative_raw / 100.0

            if meter_id not in seen_meters:
                conn.execute(
                    "INSERT OR IGNORE INTO meters (meter_id, label, active) VALUES (?, ?, 1)",
                    (meter_id, None),
                )
                seen_meters.add(meter_id)

            try:
                conn.execute(
                    """INSERT INTO raw_readings (meter_id, timestamp, cumulative_raw, cumulative_kwh, source)
                       VALUES (?, ?, ?, ?, 'rtlamr')""",
                    (meter_id, timestamp.isoformat(), cumulative_raw, cumulative_kwh),
                )
                inserted += 1
            except sqlite3.IntegrityError:
                skipped += 1

    conn.commit()
    conn.close()
    print(f"Import complete: {inserted} readings inserted, {skipped} duplicates skipped")
    print(f"Database: {db_path}")


if __name__ == "__main__":
    main()
