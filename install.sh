#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/power-monitor}"
# Service user: SUDO_USER when run via sudo, or SERVICE_USER if set, else pi
SERVICE_USER="${SERVICE_USER:-${SUDO_USER:-pi}}"

echo "== Power Monitor installer =="
echo "Target install directory: ${APP_DIR}"
echo "Service will run as user: ${SERVICE_USER}"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "This script is intended to be run as root (e.g. via: sudo ./install.sh)."
  echo "It needs permission to write to ${APP_DIR} and /etc/systemd/system."
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Copying project files to ${APP_DIR}..."
mkdir -p "${APP_DIR}"
rsync -a --delete \
  --exclude="Power Consumption BAK" \
  --exclude="power_monitor.db" \
  --exclude=".venv" \
  "${SRC_DIR}/" "${APP_DIR}/"

cd "${APP_DIR}"

echo "Checking for required commands..."
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is not installed. Please install it (e.g. sudo apt install python3) and re-run."
  exit 1
fi

if ! python3 -c "import venv" 2>/dev/null; then
  echo "ERROR: The Python venv module is not available."
  echo "On Debian/Ubuntu, install it with: sudo apt install python3-venv"
  exit 1
fi

echo "Ensuring rtl_tcp and rtlamr are installed..."

APT_AVAILABLE=false
if command -v apt-get >/dev/null 2>&1; then
  APT_AVAILABLE=true
fi

if ! command -v rtl_tcp >/dev/null 2>&1; then
  if [[ "${APT_AVAILABLE}" == "true" ]]; then
    echo "Installing rtl-sdr (rtl_tcp) via apt-get..."
    apt-get update
    apt-get install -y rtl-sdr
  else
    echo "WARNING: rtl_tcp is not installed and apt-get is not available."
    echo "Please install rtl-sdr manually and re-run this script if needed."
  fi
else
  echo "rtl_tcp already installed."
fi

if ! command -v rtlamr >/dev/null 2>&1; then
  if [[ "${APT_AVAILABLE}" == "true" ]]; then
    echo "rtlamr not found; attempting installation using Go toolchain..."
    if ! command -v go >/dev/null 2>&1; then
      echo "Installing Go via apt-get to build rtlamr..."
      apt-get install -y golang-go
    fi
    export GOPATH="/root/go"
    export GOBIN="${GOPATH}/bin"
    mkdir -p "${GOBIN}"
    echo "Running 'go install github.com/bemasher/rtlamr@latest'..."
    go install github.com/bemasher/rtlamr@latest
    if [[ -x "${GOBIN}/rtlamr" ]]; then
      cp "${GOBIN}/rtlamr" /usr/local/bin/rtlamr
      echo "Installed rtlamr to /usr/local/bin/rtlamr"
    else
      echo "WARNING: rtlamr binary not found in ${GOBIN} after go install."
      echo "You may need to install rtlamr manually; see https://github.com/bemasher/rtlamr"
    fi
  else
    echo "WARNING: rtlamr is not installed and apt-get is not available."
    echo "Please install rtlamr manually; see https://github.com/bemasher/rtlamr"
  fi
else
  echo "rtlamr already installed."
fi

VENV_DIR="${APP_DIR}/.venv"

echo "Creating Python virtual environment at ${VENV_DIR}..."
python3 -m venv "${VENV_DIR}"

echo "Installing Python backend dependencies into virtual environment..."
"${VENV_DIR}/bin/pip" install --upgrade pip >/dev/null
"${VENV_DIR}/bin/pip" install -r backend/requirements.txt

if ! command -v sqlite3 >/dev/null 2>&1; then
  if [[ "${APT_AVAILABLE}" == "true" ]]; then
    echo "Installing sqlite3 for database inspection..."
    apt-get install -y sqlite3
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  if [[ "${APT_AVAILABLE}" == "true" ]]; then
    echo "Installing Node.js and npm via apt-get..."
    apt-get install -y nodejs npm
  else
    echo "WARNING: npm is not installed and apt-get is not available."
    echo "Install Node.js and npm to build the dashboard (e.g. via nvm or your package manager)."
  fi
fi

if command -v npm >/dev/null 2>&1; then
  echo "Building frontend dashboard..."
  cd "${APP_DIR}/frontend"
  npm install
  npm run build
  cd "${APP_DIR}"
else
  echo "WARNING: Skipping frontend build (npm not available)."
fi

echo "Creating configuration directory at /etc/power-monitor..."
mkdir -p /etc/power-monitor

if [[ ! -f /etc/power-monitor/collector.env ]]; then
  cat >/etc/power-monitor/collector.env <<'EOF'
# Power Monitor collector configuration
POWER_MONITOR_DB_PATH=/opt/power-monitor/power_monitor.db
POWER_MONITOR_RTL_TCP_PATH=/usr/bin/rtl_tcp
POWER_MONITOR_RTLAMR_PATH=/usr/local/bin/rtlamr
# Comma-separated list of meter IDs to track, or leave empty for discovery mode
POWER_MONITOR_FILTER_IDS=55297873,55296867
# Whether to use -unique=true in rtlamr
POWER_MONITOR_UNIQUE=true
EOF
  echo "Created /etc/power-monitor/collector.env (edit this file to match your setup)."
else
  echo "/etc/power-monitor/collector.env already exists; leaving it unchanged."
fi

if [[ ! -f /etc/power-monitor/api.env ]]; then
  cat >/etc/power-monitor/api.env <<'EOF'
# Power Monitor API configuration
POWER_MONITOR_DB_PATH=/opt/power-monitor/power_monitor.db
EOF
  echo "Created /etc/power-monitor/api.env (edit this file to match your setup)."
else
  echo "/etc/power-monitor/api.env already exists; leaving it unchanged."
fi

# Verify service user exists
if ! id "${SERVICE_USER}" &>/dev/null; then
  echo "ERROR: Service user '${SERVICE_USER}' does not exist."
  echo "Create it (e.g. sudo useradd -m ${SERVICE_USER}) or set SERVICE_USER to an existing user:"
  echo "  sudo SERVICE_USER=yourusername ./install.sh"
  exit 1
fi

echo "Installing systemd unit files..."
cp "${APP_DIR}/backend/systemd/power-collector.service" /etc/systemd/system/power-collector.service
cp "${APP_DIR}/backend/systemd/power-api.service" /etc/systemd/system/power-api.service
# Substitute APP_DIR in unit files in case it was overridden (e.g. APP_DIR=/home/pi/power-monitor)
sed -i "s|/opt/power-monitor|${APP_DIR}|g" /etc/systemd/system/power-collector.service /etc/systemd/system/power-api.service
# Substitute service user (default in unit files is pi; use SUDO_USER or SERVICE_USER)
sed -i "s/User=pi/User=${SERVICE_USER}/g" /etc/systemd/system/power-collector.service /etc/systemd/system/power-api.service
sed -i "s/Group=pi/Group=${SERVICE_USER}/g" /etc/systemd/system/power-collector.service /etc/systemd/system/power-api.service

echo "Setting ownership of ${APP_DIR} to ${SERVICE_USER} (so services can create the database)..."
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"

echo "Reloading systemd daemon..."
systemctl daemon-reload

echo "Enabling services to start on boot..."
systemctl enable power-collector.service power-api.service

echo
echo "Installation complete."
echo
echo "Next steps:"
echo "  1) Verify and, if needed, edit: /etc/power-monitor/collector.env and /etc/power-monitor/api.env"
echo "  2) Ensure rtl_tcp and rtlamr are installed at the paths configured in collector.env."
echo "  3) Python backend runs from the virtual environment at ${APP_DIR}/.venv"
echo "  4) Start the services:"
echo "       sudo systemctl start power-collector.service"
echo "       sudo systemctl start power-api.service"
echo "  5) Access the API at:  http://<pi-ip>:8000/api/status"
echo "  6) Run the frontend dev server from ${APP_DIR}/frontend (npm run dev),"
echo "     or configure a web server to serve the built frontend from ${APP_DIR}/frontend/dist."

