## Power Monitor – SDR-Based Home Energy Dashboard

This project collects electricity usage data from household meters via SDR (`rtl_tcp` + `rtlamr`), stores it in SQLite, and exposes it via a FastAPI backend and a modern React dashboard.

### High-Level Components

- **Collector service** (`backend/app/collector/service.py`): runs `rtl_tcp` and `rtlamr`, parses CSV messages, and writes cumulative readings into SQLite.
- **Backend API** (`backend/app/main.py`): FastAPI app exposing:
  - `GET /api/meters` and `PUT /api/meters/{meter_id}`
  - `GET /api/usage` (aggregated kW / kWh over time)
  - `GET /api/status` (basic health + last reading time)
- **Dashboard** (`frontend/`): React + Vite SPA with:
  - Live gauges per meter
  - Time-series usage chart
  - Meter list / status table

### URLs and Ports

| Service   | URL                          | Port |
|-----------|------------------------------|------|
| API       | `http://<host>:8000`         | 8000 |
| Dashboard | `http://<host>:8000` (prod)  | 8000 |
| Dashboard | `http://<host>:5173` (dev)   | 5173 |

- **API**: The FastAPI backend listens on port **8000**. Health check: `http://<host>:8000/api/status`.
- **Dashboard**: After `npm run build`, the backend serves the dashboard at `http://<host>:8000/` (same port as the API). For development, run `npm run dev` from `frontend/`; the Vite dev server uses port **5173** and proxies `/api` to the backend. In production, serve the built assets from `frontend/dist` (e.g. via nginx or the backend’s static mount).

### Raspberry Pi Deployment Sketch

1. **Install dependencies**
   - Install `rtl-sdr`, `rtl_tcp`, `rtlamr` according to their docs.
   - Install Python 3 and Node.js (for building the frontend).
2. **Deploy code**
   - Copy this repo to `/opt/power-monitor`.
   - Create and activate a virtualenv, install backend requirements:
     - `pip install -r backend/requirements.txt`
   - Build the frontend:
     - `cd frontend && npm install && npm run build`
     - Serve built assets from the backend (via a static files mount, or a separate web server).
3. **Configure environment**
   - Create `/etc/power-monitor/collector.env` and `/etc/power-monitor/api.env` with settings such as:
     - `POWER_MONITOR_DB_PATH=/opt/power-monitor/power_monitor.db`
     - `POWER_MONITOR_RTL_TCP_PATH=/usr/bin/rtl_tcp`
     - `POWER_MONITOR_RTLAMR_PATH=/usr/local/bin/rtlamr`
     - `POWER_MONITOR_FILTER_IDS=55297873,55296867`
4. **Install systemd services**
   - Copy unit files from `backend/systemd/` into `/etc/systemd/system/`.
   - Run:
     - `sudo systemctl daemon-reload`
     - `sudo systemctl enable power-collector.service power-api.service`
     - `sudo systemctl start power-collector.service power-api.service`

### Importing Historical CSV Data

You can seed the database with previously collected readings so the dashboard has history when you start live collection.

**1. CSV format**

The CSV must match the rtlamr output format:

- Column 0: timestamp (ISO format, e.g. `2025-02-15T14:30:00-05:00`)
- Column 3: meter ID
- Column 7: cumulative raw reading (integer)

If your CSV came from `rtlamr -format=csv`, it should already be in this format.

**2. Import steps**

**Option A – Standalone script (no venv needed):**
```bash
cd backend && POWER_MONITOR_DB_PATH=../power_monitor.db python3 import_csv.py ../electricusage.csv
```

**Option B – Collector replay mode (on Pi):**
1. Copy your CSV to the Pi, e.g. `/opt/power-monitor/import.csv`.
2. Add this line to `/etc/power-monitor/collector.env`:
   ```
   POWER_MONITOR_REPLAY_CSV=/opt/power-monitor/import.csv
   ```
3. Run the collector once in replay mode:
   ```bash
   sudo systemctl start power-collector.service
   ```
   It will read the CSV, write readings into the database, then exit.
4. Remove the `POWER_MONITOR_REPLAY_CSV` line from `collector.env`.
5. Start live collection:
   ```bash
   sudo systemctl start power-collector.service
   ```

Refer to the plan file for more detailed behavior and future enhancements (e.g., WebSocket live updates, auth, additional metrics).

### License

This project is released under the [MIT License](LICENSE).

#### Third-party dependencies

| Component | License |
|-----------|---------|
| FastAPI, Pydantic, Uvicorn, SQLAlchemy, aiosqlite, greenlet, python-dateutil | MIT |
| React, Vite, Recharts | MIT |

#### External tools (used at runtime, not bundled)

| Tool | License | Source |
|------|---------|--------|
| rtl-sdr (rtl_tcp) | GPL-2.0 | [Osmocom rtl-sdr](https://osmocom.org/projects/rtl-sdr) |
| rtlamr | AGPL-3.0 | [bemasher/rtlamr](https://github.com/bemasher/rtlamr) |

These tools are invoked as separate executables. Install them according to their respective documentation.

