# GitHub Setup & Pi Update Guide

## Step 1: Create a new repository on GitHub

1. Go to [github.com](https://github.com) and sign in.
2. Click the **+** in the top-right → **New repository**.
3. Fill in:
   - **Repository name**: `power-monitor` (or any name you prefer)
   - **Description**: Optional, e.g. "SDR-based home energy dashboard"
   - **Visibility**: Private or Public
   - **Do NOT** check "Add a README" (you already have one)
4. Click **Create repository**.

## Step 2: Push your local project to GitHub

In your terminal, from the project directory:

```bash
cd "/Users/jleffers/Documents/Projects/Cursor/Power Consumption"

# Add your GitHub repo as the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/power-monitor.git

# Push to GitHub
git push -u origin main
```

If prompted for credentials, use your GitHub username and a **Personal Access Token** (not your password). To create one: GitHub → Settings → Developer settings → Personal access tokens → Generate new token.

## Step 3: Set up on the Pi (fresh install)

If you're setting up the Pi from scratch:

```bash
# Clone the repo
cd /opt
sudo git clone https://github.com/YOUR_USERNAME/power-monitor.git
cd power-monitor

# Run the installer
sudo ./install.sh
```

## Step 4: Update the Pi (when you push changes)

When you've made changes locally and pushed to GitHub:

```bash
cd /opt/power-monitor
sudo git pull
sudo ./install.sh   # Re-run to update venv, frontend build, systemd units
sudo systemctl restart power-collector.service power-api.service
```

Or, for a lighter update (code only, no full reinstall):

```bash
cd /opt/power-monitor
sudo git pull
# Rebuild frontend if you changed it
cd frontend && npm run build && cd ..
# Restart services
sudo systemctl restart power-collector.service power-api.service
```

## Daily workflow

1. Edit code locally.
2. Commit: `git add -A && git commit -m "Description of changes"`
3. Push: `git push`
4. On Pi: `cd /opt/power-monitor && sudo git pull && sudo systemctl restart power-collector.service power-api.service`
